import { useMemo } from "react";
import { useObsidianApp } from "src/contexts/obsidianAppContext";
import ComboboxSuggestion from "./ComboboxSuggestion";

export default function MarkdownFileSuggestInput(props: {
	value: string;
	onChange: (value: string) => void;
	placeholder?: string;
	immediate?: boolean;
}) {
	const app = useObsidianApp();
	const { value, onChange } = props;
	const items = useMemo(() => {
		const files = app.vault.getMarkdownFiles();
		const options = files.map((f) => {
			return {
				value: f.path,
				label: f.path,
				description: f.path,
			};
		});
		return options;
	}, []);

	return (
		<ComboboxSuggestion
			value={value}
			placeholder={props.placeholder || ""}
			onChange={(nextValue) => onChange(nextValue ?? "")}
			options={items}
		/>
	);
}
