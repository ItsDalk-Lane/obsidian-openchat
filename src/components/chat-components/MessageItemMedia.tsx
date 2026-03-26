import { Download, Maximize2, X } from 'lucide-react'
import { App, Notice, TFile } from 'obsidian'
import { localInstance } from 'src/i18n/locals'
import { DebugLogger } from 'src/utils/DebugLogger'

type MessageImageGalleryProps = {
	app: App
	images: string[]
	onPreview: (imageSrc: string) => void
}

type MessageImagePreviewProps = {
	imageSrc: string
	onClose: () => void
}

const resolveDownloadFileName = (imageSrc: string, index: number): string => {
	const attachmentMatch = imageSrc.match(/!\[\[(.*?)\|/)
	if (attachmentMatch) {
		return attachmentMatch[1]
	}

	if (imageSrc.startsWith('http')) {
		const urlParts = imageSrc.split('/')
		const urlFileName = urlParts[urlParts.length - 1]
		if (urlFileName.includes('.')) {
			return urlFileName
		}
	}

	return `generated-image-${index + 1}.png`
}

const downloadImage = async (app: App, imageSrc: string, index: number): Promise<void> => {
	const fileName = resolveDownloadFileName(imageSrc, index)

	if (imageSrc.startsWith('data:')) {
		const link = document.createElement('a')
		link.href = imageSrc
		link.download = fileName
		document.body.appendChild(link)
		link.click()
		document.body.removeChild(link)
		return
	}

	if (imageSrc.startsWith('http')) {
		const response = await fetch(imageSrc)
		const blob = await response.blob()
		const url = URL.createObjectURL(blob)
		const link = document.createElement('a')
		link.href = url
		link.download = fileName
		document.body.appendChild(link)
		link.click()
		document.body.removeChild(link)
		URL.revokeObjectURL(url)
		return
	}

	if (!imageSrc.includes('[[') || !imageSrc.includes(']]')) {
		return
	}

	const attachmentPath = imageSrc.match(/!\[\[(.*?)\|/)?.[1] ?? imageSrc.match(/!\[\[(.*?)\]\]/)?.[1]
	if (!attachmentPath) {
		return
	}

	const file = app.vault.getAbstractFileByPath(attachmentPath)
	if (!(file instanceof TFile)) {
		return
	}

	const arrayBuffer = await app.vault.readBinary(file)
	const blob = new Blob([arrayBuffer])
	const url = URL.createObjectURL(blob)
	const link = document.createElement('a')
	link.href = url
	link.download = file.name
	document.body.appendChild(link)
	link.click()
	document.body.removeChild(link)
	URL.revokeObjectURL(url)
}

export const MessageImageGallery = ({ app, images, onPreview }: MessageImageGalleryProps) => {
	const handleDownload = async (imageSrc: string, index: number) => {
		try {
			await downloadImage(app, imageSrc, index)
		} catch (error) {
			DebugLogger.error('[MessageItem] 下载图片失败', error)
			new Notice(localInstance.chat_download_image_failed)
		}
	}

	return (
		<div className="message-images tw-mb-2 tw-flex tw-flex-wrap tw-gap-2">
			{images.map((image, index) => (
				<div key={index} className="tw-relative tw-group/image">
					<img
						src={image}
						alt={`message-image-${index}`}
						className="message-image tw-max-w-xs tw-rounded-md tw-border tw-border-gray-300 tw-cursor-pointer hover:tw-opacity-80 tw-transition-opacity"
						style={{ maxHeight: '200px' }}
						onClick={() => onPreview(image)}
					/>
					<div className="tw-absolute tw-top-2 tw-right-2 tw-flex tw-gap-1 tw-opacity-0 tw-transition-opacity group-hover/image:tw-opacity-100">
						<button
							onClick={() => onPreview(image)}
							className="tw-cursor-pointer tw-rounded tw-bg-black tw-bg-opacity-50 tw-p-1 tw-text-white hover:tw-bg-opacity-70"
							title={localInstance.chat_view_large_image}
						>
							<Maximize2 className="tw-size-3" />
						</button>
						<button
							onClick={() => void handleDownload(image, index)}
							className="tw-cursor-pointer tw-rounded tw-bg-black tw-bg-opacity-50 tw-p-1 tw-text-white hover:tw-bg-opacity-70"
							title={localInstance.chat_download_image}
						>
							<Download className="tw-size-3" />
						</button>
					</div>
				</div>
			))}
		</div>
	)
}

export const MessageImagePreview = ({ imageSrc, onClose }: MessageImagePreviewProps) => (
	<div
		className="tw-fixed tw-inset-0 tw-z-50 tw-flex tw-items-center tw-justify-center tw-bg-black tw-bg-opacity-75 tw-p-4"
		onClick={onClose}
	>
		<div className="tw-relative tw-max-h-full tw-max-w-full">
			<img
				src={imageSrc}
				alt={localInstance.chat_image_preview_alt}
				className="tw-max-h-full tw-max-w-full tw-rounded-md tw-object-contain"
			/>
			<button
				onClick={onClose}
				className="tw-absolute tw-top-2 tw-right-2 tw-cursor-pointer tw-rounded-full tw-bg-white tw-p-2 tw-shadow-lg hover:tw-bg-gray-100"
			>
				<X className="tw-size-4 tw-text-black" />
			</button>
		</div>
	</div>
)