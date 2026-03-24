import { type FormEvent, useState } from 'react';
import { localInstance } from 'src/i18n/locals';

interface CreateFileFormProps {
	fileType: string;
	defaultBasename?: string;
	defaultTargetFolder?: string;
	onSubmit: (fileName: string, targetFolder: string) => Promise<void>;
	onCancel: () => void;
}

export function CreateFileForm(props: CreateFileFormProps) {
	const {
		fileType,
		defaultBasename = '',
		defaultTargetFolder = '',
		onSubmit,
		onCancel,
	} = props;
	const [fileName, setFileName] = useState(defaultBasename);
	const [targetFolder, setTargetFolder] = useState(defaultTargetFolder);
	const [submitting, setSubmitting] = useState(false);
	const [error, setError] = useState<string | null>(null);

	const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
		event.preventDefault();
		const normalizedFileName = fileName.trim();
		const normalizedTargetFolder = targetFolder.trim();
		if (!normalizedFileName) {
			setError(localInstance.file_name_cannot_be_empty);
			return;
		}

		setSubmitting(true);
		setError(null);
		try {
			await onSubmit(normalizedFileName, normalizedTargetFolder);
		} catch (submitError) {
			setError(submitError instanceof Error ? submitError.message : String(submitError));
		} finally {
			setSubmitting(false);
		}
	};

	return (
		<form className="form--CreateFileForm" onSubmit={handleSubmit}>
			<div className="form--CreateFileForm__field">
				<label>{fileType} {localInstance.create_file}</label>
				<input
					type="text"
					value={fileName}
					onChange={(event) => setFileName(event.target.value)}
					placeholder={defaultBasename || `${fileType}.md`}
				/>
			</div>
			<div className="form--CreateFileForm__field">
				<label>Target Folder</label>
				<input
					type="text"
					value={targetFolder}
					onChange={(event) => setTargetFolder(event.target.value)}
					placeholder={defaultTargetFolder}
				/>
			</div>
			{error && <div className="form--CreateFileForm__error">{error}</div>}
			<div className="form--CreateFileForm__actions">
				<button type="submit" disabled={submitting}>
					{submitting ? 'Saving...' : localInstance.create}
				</button>
				<button type="button" disabled={submitting} onClick={onCancel}>
					{localInstance.cancel}
				</button>
			</div>
		</form>
	);
}
