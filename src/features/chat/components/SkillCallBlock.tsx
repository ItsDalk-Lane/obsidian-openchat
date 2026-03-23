import { ChevronDown, ChevronRight } from 'lucide-react';
import { TFile } from 'obsidian';
import { useCallback, useEffect, useState } from 'react';
import { useObsidianApp } from 'src/context/obsidianAppContext';

interface SkillCallBlockProps {
	skillName: string;
	skillPath?: string;
	fallbackContent: string;
}

export const SkillCallBlock = ({
	skillName,
	skillPath,
	fallbackContent,
}: SkillCallBlockProps) => {
	const app = useObsidianApp();
	const [collapsed, setCollapsed] = useState(true);
	const [fullSkillContent, setFullSkillContent] = useState<string | null>(null);

	useEffect(() => {
		if (collapsed || !skillPath) {
			return;
		}
		let cancelled = false;
		const run = async () => {
			const abstractFile = app.vault.getAbstractFileByPath(skillPath);
			if (!(abstractFile instanceof TFile)) {
				if (!cancelled) {
					setFullSkillContent(null);
				}
				return;
			}
			const content = await app.vault.read(abstractFile);
			if (!cancelled) {
				setFullSkillContent(content);
			}
		};
		void run();
		return () => {
			cancelled = true;
		};
	}, [app, collapsed, skillPath]);

	const toggleCollapse = useCallback(() => {
		setCollapsed((prev) => !prev);
	}, []);

	return (
		<div className="ff-reasoning-block">
			<div
				className="ff-reasoning-header"
				onClick={toggleCollapse}
			>
				<span className="ff-reasoning-title">{`Skill: ${skillName}`}</span>
				<span className="ff-reasoning-toggle">
					{collapsed ? <ChevronRight className="tw-size-4" /> : <ChevronDown className="tw-size-4" />}
				</span>
			</div>
			{!collapsed && (
				<pre className="ff-reasoning-content ff-skill-call-content">
					{fullSkillContent ?? fallbackContent}
				</pre>
			)}
		</div>
	);
};
