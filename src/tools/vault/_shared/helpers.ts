import {
	assertVaultPath,
	assertVaultPathOrRoot,
	ensureFolderExists,
	ensureParentFolderExists,
	getAbstractFileOrThrow,
	getFileOrThrow,
	getFileStat,
	getFolderOrThrow,
	normalizeVaultPath,
} from '../helpers'
import {
	appendToDailyNoteContent,
	ensureDailyNoteParentFolder,
	normalizeSectionHeading,
	parseDailyNoteDate,
	readDailyNotesConfig,
	resolveDailyNoteTarget,
} from './daily-note'
import {
	parseFrontmatterDocument,
	serializeFrontmatterDocument,
} from './frontmatter'

export {
	appendToDailyNoteContent,
	assertVaultPath,
	assertVaultPathOrRoot,
	ensureDailyNoteParentFolder,
	ensureFolderExists,
	ensureParentFolderExists,
	getAbstractFileOrThrow,
	getFileOrThrow,
	getFileStat,
	getFolderOrThrow,
	normalizeSectionHeading,
	normalizeVaultPath,
	parseDailyNoteDate,
	parseFrontmatterDocument,
	readDailyNotesConfig,
	resolveDailyNoteTarget,
	serializeFrontmatterDocument,
}
