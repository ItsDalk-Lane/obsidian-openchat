import { ChevronDown, ChevronRight } from 'lucide-react';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useObsidianApp } from 'src/contexts/obsidianAppContext';
import { createObsidianApiProvider } from 'src/providers/obsidian-api';

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
	const obsidianApi = useMemo(() => createObsidianApiProvider(app, async () => ''), [app]);
	const [collapsed, setCollapsed] = useState(true);
	const [fullSkillContent, setFullSkillContent] = useState<string | null>(null);

	useEffect(() => {
		if (collapsed || !skillPath) {
			return;
		}
		let cancelled = false;
		const run = async () => {
			const abstractFile = obsidianApi.getVaultEntry(skillPath);
			if (!abstractFile || abstractFile.kind !== 'file') {
				if (!cancelled) {
					setFullSkillContent(null);
				}
				return;
			}
			const content = await obsidianApi.readVaultFile(abstractFile.path);
			if (!cancelled) {
				setFullSkillContent(content);
			}
		};
		void run();
		return () => {
			cancelled = true;
		};
	}, [collapsed, obsidianApi, skillPath]);

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
