import argparse
import json
from pathlib import Path

from playwright.sync_api import sync_playwright


CHROME = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"


def wait_until_ready(page):
    page.wait_for_function(
        "document.readyState === 'complete' && document.title === 'Pi Web'",
    )
    page.locator("#root").wait_for(state="visible")
    page.wait_for_timeout(800)


def collect_failures(page):
    failures = {"console": [], "page": [], "request": []}
    page.on(
        "console",
        lambda message: failures["console"].append(message.text)
        if message.type == "error"
        else None,
    )
    page.on("pageerror", lambda error: failures["page"].append(str(error)))

    def on_request_failed(request):
        reason = request.failure or "unknown"
        if "ERR_ABORTED" not in reason and "/events" not in request.url:
            failures["request"].append(f"{request.method} {request.url}: {reason}")

    page.on("requestfailed", on_request_failed)
    return failures


def desktop_capture(browser, label, url, output_path, exercise=False):
    page = browser.new_page(viewport={"width": 1440, "height": 960}, device_scale_factor=1)
    page.set_default_timeout(5000)
    failures = collect_failures(page)
    page.goto(url, wait_until="domcontentloaded")
    wait_until_ready(page)

    result = page.evaluate(
        """
        () => ({
          title: document.title,
          readyState: document.readyState,
          rootChildren: document.querySelector('#root')?.children.length ?? 0,
          buttons: document.querySelectorAll('button').length,
          hasScopedShell: Boolean(document.querySelector('.pi-app-shell')),
          horizontalOverflow: document.documentElement.scrollWidth > document.documentElement.clientWidth,
        })
        """,
    )

    if exercise:
        toolbar_button = page.locator(".pi-toolbar-button").first
        if toolbar_button.count() > 0:
            toolbar_button.hover()
            result["toolbarHoverBackground"] = toolbar_button.evaluate(
                "(element) => getComputedStyle(element).backgroundColor",
            )

        project_selector = page.locator(".pi-project-selector")
        scoped_project_selector = project_selector.count() > 0
        if not scoped_project_selector:
            project_selector = page.get_by_text("选择项目…", exact=True).locator("..")
        result["projectSelectorVisible"] = project_selector.is_visible()
        project_selector.evaluate("(element) => element.click()")
        page.wait_for_timeout(150)
        if scoped_project_selector:
            menu_action = page.locator(".pi-sidebar-menu-action").first
            result["projectMenuOpened"] = page.locator(".pi-project-selector-wrap").locator("button").count() > 1
        else:
            menu_action = page.get_by_text("使用默认目录", exact=True).locator("..")
            result["projectMenuOpened"] = menu_action.is_visible()
        menu_action.evaluate("(element) => element.click()")

        textarea = page.locator(".pi-chat-textarea").first
        if textarea.count() == 0:
            textarea = page.locator("textarea").first
        textarea.wait_for(state="visible")
        textarea.focus()
        page.wait_for_timeout(150)
        input_shell = page.locator(".pi-chat-input-shell")
        if input_shell.count() == 0:
            input_shell = textarea.locator("..")
        result["focus"] = input_shell.evaluate(
            """
            (element) => {
              const style = getComputedStyle(element);
              return {
                borderColor: style.borderColor,
                boxShadow: style.boxShadow,
              };
            }
            """,
        )
        result["projectSelected"] = (
            project_selector.evaluate("(element) => element.classList.contains('has-selection')")
            if scoped_project_selector
            else textarea.is_visible()
        )
        empty_state = page.locator(".pi-chat-empty")
        result["emptyStateVisible"] = empty_state.is_visible() if empty_state.count() > 0 else textarea.is_visible()

    page.screenshot(path=str(output_path), full_page=False)
    page.close()
    result["failures"] = failures
    print(json.dumps({label: result}, ensure_ascii=False))
    return result


def mobile_capture(browser, url, output_path):
    page = browser.new_page(viewport={"width": 390, "height": 844}, device_scale_factor=1)
    page.set_default_timeout(5000)
    failures = collect_failures(page)
    page.goto(url, wait_until="domcontentloaded")
    wait_until_ready(page)

    sidebar = page.locator(".sidebar-container")
    if not sidebar.evaluate("(element) => element.classList.contains('sidebar-open')"):
        page.locator(".pi-toolbar-button").first.click()
        page.wait_for_timeout(300)

    result = {
        "sidebarOpen": sidebar.evaluate("(element) => element.classList.contains('sidebar-open')"),
        "horizontalOverflow": page.evaluate(
            "document.documentElement.scrollWidth > document.documentElement.clientWidth",
        ),
        "failures": failures,
    }
    page.screenshot(path=str(output_path), full_page=False)
    page.close()
    print(json.dumps({"after-mobile": result}, ensure_ascii=False))
    return result


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--before-url", required=True)
    parser.add_argument("--after-url", required=True)
    parser.add_argument("--output-dir", required=True)
    args = parser.parse_args()

    output_dir = Path(args.output_dir)
    output_dir.mkdir(parents=True, exist_ok=True)

    with sync_playwright() as playwright:
        browser = playwright.chromium.launch(executable_path=CHROME, headless=True)
        before = desktop_capture(
            browser,
            "before",
            args.before_url,
            output_dir / "pi-web-before.png",
            exercise=True,
        )
        after = desktop_capture(
            browser,
            "after",
            args.after_url,
            output_dir / "pi-web-after.png",
            exercise=True,
        )
        mobile = mobile_capture(
            browser,
            args.after_url,
            output_dir / "pi-web-after-mobile.png",
        )
        browser.close()

    all_failures = [
        *before["failures"]["console"],
        *before["failures"]["page"],
        *before["failures"]["request"],
        *after["failures"]["console"],
        *after["failures"]["page"],
        *after["failures"]["request"],
        *mobile["failures"]["console"],
        *mobile["failures"]["page"],
        *mobile["failures"]["request"],
    ]
    if all_failures:
        raise SystemExit(f"unexpected browser failures: {json.dumps(all_failures, ensure_ascii=False)}")
    if (
        not after.get("hasScopedShell")
        or not after.get("emptyStateVisible")
        or not after.get("projectSelectorVisible")
        or not after.get("projectMenuOpened")
        or not after.get("projectSelected")
    ):
        raise SystemExit("after desktop smoke did not reach the expected main interface")
    if after.get("focus", {}).get("boxShadow") == "none":
        raise SystemExit("after desktop smoke did not expose the input focus ring")
    if after.get("toolbarHoverBackground") in {"rgba(0, 0, 0, 0)", "transparent"}:
        raise SystemExit("after desktop smoke did not expose toolbar hover feedback")
    if not mobile.get("sidebarOpen") or mobile.get("horizontalOverflow"):
        raise SystemExit("after mobile smoke did not preserve the expected sidebar layout")
    print("VISUAL SMOKE PASS")


if __name__ == "__main__":
    main()
