import { useEffect, useMemo, useRef, useState } from 'react'
import Papa from 'papaparse'
import {
  ArrowDownUp,
  BookOpen,
  Check,
  ChevronDown,
  Library,
  Plus,
  RefreshCw,
  Search,
  Star,
  Upload,
  X,
} from 'lucide-react'
import './App.css'

type Book = {
  id: string
  title: string
  author: string
  category: string
  rating: number
  year: number | null
  dateRead: string
  isbn: string
  pages: number | null
  shelves: string[]
  tags: string[]
  format?: ReadingFormat
  kind?: BookKind
  kindSource?: 'lookup' | 'manual' | 'sheet' | ''
  kindCheckedAt?: number
}

type BookKind = 'Fiction' | 'Nonfiction' | 'Unclear'
type ReadingFormat = 'Audio' | 'Physical' | 'Kindle' | 'Unclear'

type OpenLibraryEntry = {
  title?: string
  subjects?: { name: string }[]
}

type BookMix = {
  fiction: number
  nonfiction: number
  unclear: number
}

type FormatMix = {
  audio: number
  physical: number
  kindle: number
  unclear: number
}

const STORAGE_KEY = 'shelf-notes-books'
const CATEGORIES_KEY = 'shelf-notes-categories'
const DEMO_KEY = 'shelf-notes-demo'
const GOOGLE_SHEET_GIDS = ['311097372', '27477479', '632702910', '675000302']
const GOOGLE_SHEET_URL = 'https://docs.google.com/spreadsheets/d/1gLdN5dpgPDGgn_HA4Ll0gAUOSftuFmY9yMxQALSB_UY/edit'
const LAST_SYNC_KEY = 'shelf-notes-sheet-last-sync'
const uncategorized = 'Uncategorized'

const sampleBooks: Book[] = [
  { id: '9780316556347', title: 'Circe', author: 'Madeline Miller', category: 'Myth & legend', rating: 5, year: 2018, dateRead: '2025/01/14', isbn: '9780316556347', pages: 393, shelves: ['myth-retellings', 'favorites'], tags: [] },
  { id: '9780399590504', title: 'Educated', author: 'Tara Westover', category: 'Memoir', rating: 5, year: 2018, dateRead: '2024/11/02', isbn: '9780399590504', pages: 334, shelves: ['memoir', 'favorites'], tags: [] },
  { id: '9781635575637', title: 'Piranesi', author: 'Susanna Clarke', category: 'Literary fiction', rating: 4, year: 2020, dateRead: '2024/09/18', isbn: '9781635575637', pages: 272, shelves: ['fiction', 'dreamlike'], tags: [] },
  { id: '9780525657743', title: 'Crying in H Mart', author: 'Michelle Zauner', category: 'Memoir', rating: 4, year: 2021, dateRead: '2024/06/30', isbn: '9780525657743', pages: 256, shelves: ['memoir', 'music'], tags: [] },
  { id: '9780441172719', title: 'Dune', author: 'Frank Herbert', category: 'Science fiction', rating: 5, year: 1965, dateRead: '2024/03/11', isbn: '9780441172719', pages: 688, shelves: ['science-fiction', 'favorites'], tags: [] },
  { id: '9781571313560', title: 'Braiding Sweetgrass', author: 'Robin Wall Kimmerer', category: 'Nature & science', rating: 5, year: 2013, dateRead: '2023/12/05', isbn: '9781571313560', pages: 408, shelves: ['nature', 'nonfiction'], tags: [] },
  { id: '9780062060624', title: 'The Song of Achilles', author: 'Madeline Miller', category: 'Myth & legend', rating: 4, year: 2011, dateRead: '2023/08/23', isbn: '9780062060624', pages: 416, shelves: ['myth-retellings', 'romance'], tags: [] },
  { id: '9780441478125', title: 'The Left Hand of Darkness', author: 'Ursula K. Le Guin', category: 'Science fiction', rating: 4, year: 1969, dateRead: '2022/04/17', isbn: '9780441478125', pages: 304, shelves: ['science-fiction', 'classics'], tags: [] },
]

function readStoredBooks(): Book[] {
  try {
    const stored = localStorage.getItem(STORAGE_KEY)
    const books = stored ? JSON.parse(stored) as Book[] : sampleBooks
    return books.map((book) => ({
      ...book,
      tags: book.tags ?? [],
      rating: normalizeStoredRating(book.rating),
      format: book.format ?? 'Unclear',
      kind: book.kind ?? 'Unclear',
      kindSource: book.kindSource ?? '',
      kindCheckedAt: book.kindCheckedAt ?? 0,
    }))
  } catch {
    return sampleBooks
  }
}

function readStoredCategories(): string[] {
  try {
    const stored = localStorage.getItem(CATEGORIES_KEY)
    return stored ? JSON.parse(stored) as string[] : []
  } catch {
    return []
  }
}

function normalizeHeader(value: string) {
  return value.trim().toLowerCase()
}

function shelfLabel(value: string) {
  const known: Record<string, string> = {
    'sci-fi': 'Science fiction',
    'science-fiction': 'Science fiction',
    'non-fiction': 'Nonfiction',
    'graphic-novels': 'Graphic novels',
    'ya': 'Young adult',
  }
  const cleaned = value.trim().replace(/[_-]+/g, ' ').replace(/\s+/g, ' ')
  return known[cleaned.toLowerCase()] ?? cleaned.replace(/\b\w/g, (letter) => letter.toUpperCase())
}

function categoryFromShelves(shelves: string[]) {
  const ignored = new Set(['read', 'currently-reading', 'to-read', 'favorites', 'owned', 'wishlist'])
  const category = shelves.find((shelf) => !ignored.has(shelf.trim().toLowerCase()))
  return category ? shelfLabel(category) : uncategorized
}

function rowValue(row: Record<string, string>, ...names: string[]) {
  const normalized = new Map(Object.entries(row).map(([key, value]) => [normalizeHeader(key), value]))
  for (const name of names) {
    const value = normalized.get(normalizeHeader(name))
    if (value?.trim()) return value.trim()
  }
  return ''
}

function parseNumber(value: string) {
  const parsed = Number.parseInt(value.replace(/[^\d]/g, ''), 10)
  return Number.isFinite(parsed) ? parsed : null
}

function parseRating(value: string) {
  const match = value.trim().replace(',', '.').match(/\d+(?:\.\d+)?/)
  if (!match) return null
  const parsed = Number(match[0])
  return Number.isFinite(parsed) && parsed >= 0 && parsed <= 5 ? parsed : null
}

function normalizeStoredRating(value: number) {
  if (!Number.isFinite(value) || value < 0) return 0
  if (value <= 5) return value
  if (Number.isInteger(value) && value <= 50) return value / 10
  if (Number.isInteger(value) && value <= 500) return value / 100
  return 0
}

function normalizeIsbn(value: string) {
  const isbn = value.replace(/[="\s-]/g, '').toUpperCase()
  if (/^\d{13}$/.test(isbn)) return isbn
  if (!/^\d{9}[\dX]$/.test(isbn)) return isbn

  const base = `978${isbn.slice(0, 9)}`
  const checksum = [...base].reduce((sum, digit, index) => sum + Number(digit) * (index % 2 ? 3 : 1), 0)
  return `${base}${(10 - checksum % 10) % 10}`
}

function formatFinishedDate(value: string) {
  const match = value.match(/^(\d{4})[/-](\d{1,2})[/-](\d{1,2})$/)
  if (match) {
    const [, year, month, day] = match
    return new Intl.DateTimeFormat(undefined, { month: 'short', day: 'numeric', year: 'numeric' })
      .format(new Date(Number(year), Number(month) - 1, Number(day)))
  }
  const monthMatch = value.match(/^(\d{4})[/-](\d{1,2})$/)
  if (monthMatch) {
    const [, year, month] = monthMatch
    return new Intl.DateTimeFormat(undefined, { month: 'short', year: 'numeric' })
      .format(new Date(Number(year), Number(month) - 1, 1))
  }
  return value
}

function bookMix(books: Book[]): BookMix {
  return books.reduce<BookMix>((mix, book) => {
    if (book.kind === 'Fiction') mix.fiction++
    else if (book.kind === 'Nonfiction') mix.nonfiction++
    else mix.unclear++
    return mix
  }, { fiction: 0, nonfiction: 0, unclear: 0 })
}

function mixPercent(count: number, classifiedCount: number) {
  return classifiedCount ? Math.round(count / classifiedCount * 100) : 0
}

function formatMix(books: Book[]): FormatMix {
  return books.reduce<FormatMix>((mix, book) => {
    if (book.format === 'Audio') mix.audio++
    else if (book.format === 'Physical') mix.physical++
    else if (book.format === 'Kindle') mix.kindle++
    else mix.unclear++
    return mix
  }, { audio: 0, physical: 0, kindle: 0, unclear: 0 })
}

function bookFromRow(row: Record<string, string>, assumeRead = false, fallbackDate = '', classificationSource: 'manual' | 'sheet' = 'manual'): Book | null {
  const title = rowValue(row, 'Title', 'Book Title')
  if (!title) return null

  const shelves = rowValue(row, 'Bookshelves', 'Shelves', 'Custom Shelves').split(/[,;|]/).map((shelf) => shelf.trim()).filter(Boolean)
  const exclusiveShelf = rowValue(row, 'Exclusive Shelf').toLowerCase()
  const readStatus = rowValue(row, 'Reading Status', 'Status', 'Read?').toLowerCase()
  const isRead = exclusiveShelf
    ? exclusiveShelf === 'read'
    : readStatus
      ? ['read', 'finished', 'complete', 'completed', 'yes'].includes(readStatus)
      : shelves.some((shelf) => shelf.toLowerCase() === 'read') || assumeRead
  if (!isRead) return null

  const isbn = normalizeIsbn(rowValue(row, 'ISBN13', 'ISBN'))
  const author = rowValue(row, 'Author', 'Author l-f', 'Author Name') || 'Unknown author'
  const id = isbn.replace(/[^\dX]/gi, '') || `${title.toLowerCase()}-${author.toLowerCase()}`
  const dateRead = rowValue(row, 'Date Read', 'Read Date', 'Date Finished', 'Finished Date', 'Date Completed') || fallbackDate
  const typeValue = rowValue(row, 'Nonfiction?', 'Non Fiction?', 'Non-fiction?', 'Book Type', 'Kind').toLowerCase()
  const kind: BookKind = ['yes', 'true', '1', 'nonfiction', 'non-fiction'].includes(typeValue)
    ? 'Nonfiction'
    : ['no', 'false', '0', 'fiction'].includes(typeValue)
      ? 'Fiction'
      : 'Unclear'
  const categories = rowValue(row, 'Category', 'Genre', 'Genres', 'Primary Genre')
  const tags = rowValue(row, 'Tags', 'My Tags', 'Personal Tags').split(/[,;|]/).map((tag) => tag.trim()).filter(Boolean)
  const rawFormat = rowValue(row, 'Form', 'Format', 'Type', 'Medium').trim().toLowerCase()
  const format: ReadingFormat = ['audio', 'audiobook', 'audio book'].includes(rawFormat)
    ? 'Audio'
    : ['physical', 'print', 'paperback', 'hardcover'].includes(rawFormat)
      ? 'Physical'
      : ['kindle', 'ebook', 'e-book', 'e book'].includes(rawFormat)
        ? 'Kindle'
        : 'Unclear'
  const form = rowValue(row, 'Form', 'Format', 'Type', 'Medium')
  if (form && !shelves.includes(form)) shelves.push(form)

  return {
    id,
    title,
    author,
    category: categories || (kind !== 'Unclear' ? kind : categoryFromShelves(shelves)),
    rating: parseRating(rowValue(row, 'My Rating', 'Rating')) ?? 0,
    year: parseNumber(rowValue(row, 'Original Publication Year', 'Year Published')),
    dateRead,
    isbn: isbn.replace(/[^\dX]/gi, ''),
    pages: parseNumber(rowValue(row, 'Number of Pages', 'Pages')),
    shelves,
    tags,
    format,
    kind,
    kindSource: kind === 'Unclear' ? '' : classificationSource,
  }
}

function monthSummary(value: string) {
  const match = value.trim().match(/^(Jan(?:uary)?|Feb(?:ruary)?|Mar(?:ch)?|Apr(?:il)?|May|Jun(?:e)?|Jul(?:y)?|Aug(?:ust)?|Sep(?:t(?:ember)?)?|Oct(?:ober)?|Nov(?:ember)?|Dec(?:ember)?)\s+(\d{4})$/i)
  if (!match) return ''
  const monthIndex = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'].indexOf(match[1].slice(0, 3).toLowerCase())
  return monthIndex >= 0 ? `${match[2]}/${String(monthIndex + 1).padStart(2, '0')}` : ''
}

function sheetBooksFromCsv(csv: string) {
  const rows = Papa.parse<string[]>(csv, { header: false, skipEmptyLines: 'greedy' }).data
  const books: Book[] = []
  let headers = ['Title', 'Author', 'Form', 'Nonfiction?', 'Rating']
  let finishedMonth = ''

  for (const cells of rows) {
    const firstCell = cells[0]?.trim() ?? ''
    const month = monthSummary(firstCell)
    if (month) {
      finishedMonth = month
      const extraHeaders = cells.slice(2).map((cell) => cell.trim()).filter(Boolean)
      if (extraHeaders.some((header) => ['form', 'type', 'rating', 'nonfiction?', 'non fiction?'].includes(header.toLowerCase()))) {
        headers = ['Title', 'Author', ...cells.slice(2).map((cell) => cell.trim())]
      }
      continue
    }

    const hasTitleHeader = cells.some((cell) => normalizeHeader(cell) === 'title' || normalizeHeader(cell) === 'book title')
    const hasAuthorHeader = cells.some((cell) => normalizeHeader(cell) === 'author' || normalizeHeader(cell) === 'author name')
    if (hasTitleHeader && hasAuthorHeader) {
      headers = cells.map((cell) => cell.trim())
      continue
    }

    const row = Object.fromEntries(headers.map((header, index) => [header, cells[index]?.trim() ?? '']))
    const book = bookFromRow(row, true, finishedMonth, 'sheet')
    if (book) books.push(book)
  }

  return books
}

async function loadSheetBooks() {
  const tabData = await Promise.all(GOOGLE_SHEET_GIDS.map(async (gid) => {
    const response = await fetch(`/google-sheet-csv/${gid}`, { cache: 'no-store' })
    const csv = await response.text()
    if (!response.ok || /^\s*</.test(csv)) {
      throw new Error('The Google Sheet is not publicly viewable. Set General access to Anyone with the link (Viewer), then retry.')
    }
    return sheetBooksFromCsv(csv)
  }))
  const books = mergeBooks([], tabData.flat(), false)
  if (!books.length) throw new Error('No book rows found in the selected Google Sheet tabs.')
  return books
}

function mergeBooks(current: Book[], incoming: Book[], replaceCurrent: boolean) {
  const merged = new Map((replaceCurrent ? [] : current).map((book) => [book.id, book]))
  for (const book of incoming) {
    const previous = merged.get(book.id) ?? [...merged.values()].find((candidate) => candidate.isbn && candidate.isbn === book.isbn)
    if (previous && previous.id !== book.id) merged.delete(previous.id)
    const keepManualKind = previous?.kindSource === 'manual'
    const useIncomingKind = ['lookup', 'sheet'].includes(book.kindSource ?? '') && !keepManualKind
    merged.set(book.id, previous ? {
      ...book,
      category: previous.category,
      tags: previous.tags ?? [],
      format: book.format && book.format !== 'Unclear' ? book.format : previous.format ?? 'Unclear',
      kind: keepManualKind ? previous.kind : (useIncomingKind ? book.kind : previous.kind ?? book.kind ?? 'Unclear'),
      kindSource: keepManualKind ? 'manual' : (useIncomingKind ? book.kindSource : previous.kindSource ?? book.kindSource ?? ''),
      kindCheckedAt: keepManualKind ? previous.kindCheckedAt : (useIncomingKind ? book.kindCheckedAt : previous.kindCheckedAt ?? book.kindCheckedAt ?? 0),
    } : book)
  }
  return [...merged.values()]
}

function classifySubjects(subjects: string[]): BookKind {
  const normalized = subjects.map((subject) => subject.toLowerCase().replace(/[_-]+/g, ' '))
  const fiction = normalized.some((subject) => /\bfiction\b|\bnovel\b|\bshort stories\b|\bfantasy\b|\bmystery\b|\bthriller\b|\bhorror\b|\bromance\b|\bpoetry\b|\bdrama\b/.test(subject))
  if (fiction) return 'Fiction'

  const nonfiction = normalized.some((subject) => /\bnon fiction\b|\bbiograph|\bmemoir\b|\bhistory\b|\bscience\b|\bbotany\b|\becology\b|\bsocial science\b|\bpolitic|\bbusiness\b|\bphilosophy\b|\bpsychology\b|\bnature\b|\btravel\b|\beducation\b|\breference\b|\bhealth\b|\breligion\b|\bcooking\b|\beconomics\b|\blaw\b|\btechnology\b|\banthropology\b|\bsociology\b|\bethnology\b/.test(subject))
  return nonfiction ? 'Nonfiction' : 'Unclear'
}

function titlesMatch(bookTitle: string, catalogTitle: string) {
  const normalize = (title: string) => title.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim()
  const expected = normalize(bookTitle)
  const actual = normalize(catalogTitle)
  return Boolean(expected && actual && (actual.includes(expected) || expected.includes(actual)))
}

async function lookupBookKinds(books: Book[]) {
  const checkedBefore = Date.now() - 30 * 24 * 60 * 60 * 1000
  const lookupBooks = books.filter((book) => book.isbn && book.kindSource !== 'manual' && (book.kindCheckedAt ?? 0) < checkedBefore)
  if (!lookupBooks.length) return books

  const classificationByIsbn = new Map<string, { kind: BookKind; checkedAt: number }>()
  const isbns = [...new Set(lookupBooks.map((book) => book.isbn))]

  for (let index = 0; index < isbns.length; index += 40) {
    const batch = isbns.slice(index, index + 40)
    const bibkeys = batch.map((isbn) => `ISBN:${isbn}`).join(',')
    try {
      const response = await fetch(`https://openlibrary.org/api/books?bibkeys=${encodeURIComponent(bibkeys)}&format=json&jscmd=data`)
      if (!response.ok) continue
      const entries = await response.json() as Record<string, OpenLibraryEntry>
      const checkedAt = Date.now()
      for (const isbn of batch) {
        const entry = entries[`ISBN:${isbn}`]
        const matchingTitle = entry?.title && lookupBooks.some((book) => book.isbn === isbn && titlesMatch(book.title, entry.title!))
        const subjects = matchingTitle ? (entry.subjects ?? []).map((subject) => subject.name) : []
        classificationByIsbn.set(isbn, { kind: classifySubjects(subjects), checkedAt })
      }
    } catch {
      return books
    }
  }

  return books.map((book) => {
    if (!book.isbn || book.kindSource === 'manual') return book
    const classification = classificationByIsbn.get(book.isbn)
    return classification
      ? { ...book, kind: classification.kind, kindSource: 'lookup' as const, kindCheckedAt: classification.checkedAt }
      : book
  })
}

function BookCover({ book, index }: { book: Book; index: number }) {
  const [failed, setFailed] = useState(false)
  const coverUrl = book.isbn ? `https://covers.openlibrary.org/b/isbn/${book.isbn}-M.jpg?default=false` : ''

  return (
    <div className={`book-cover cover-${index % 6}`} aria-label={`Cover for ${book.title}`}>
      <span className="cover-title">{book.title}</span>
      <span className="cover-author">{book.author}</span>
      {coverUrl && !failed && (
        <img src={coverUrl} alt={`Cover of ${book.title}`} loading="lazy" onError={() => setFailed(true)} />
      )}
    </div>
  )
}

function App() {
  const [books, setBooks] = useState<Book[]>(readStoredBooks)
  const [customCategories, setCustomCategories] = useState<string[]>(readStoredCategories)
  const [isDemo, setIsDemo] = useState(() => localStorage.getItem(DEMO_KEY) !== 'false')
  const [activeCategory, setActiveCategory] = useState('All books')
  const [query, setQuery] = useState('')
  const [sortBy, setSortBy] = useState('recent')
  const [notice, setNotice] = useState('')
  const [categoryDraft, setCategoryDraft] = useState('')
  const [isAddingCategory, setIsAddingCategory] = useState(false)
  const [tagDraft, setTagDraft] = useState('')
  const [addingTagBookId, setAddingTagBookId] = useState('')
  const [selectedReadingYear, setSelectedReadingYear] = useState('')
  const [syncVersion, setSyncVersion] = useState(0)
  const [isSyncing, setIsSyncing] = useState(false)
  const [lastSyncedAt, setLastSyncedAt] = useState(() => localStorage.getItem(LAST_SYNC_KEY) ?? '')
  const fileInput = useRef<HTMLInputElement>(null)
  const booksRef = useRef(books)

  useEffect(() => {
    booksRef.current = books
    localStorage.setItem(STORAGE_KEY, JSON.stringify(books))
  }, [books])

  useEffect(() => {
    localStorage.setItem(CATEGORIES_KEY, JSON.stringify(customCategories))
  }, [customCategories])

  useEffect(() => {
    localStorage.setItem(DEMO_KEY, String(isDemo))
  }, [isDemo])

  useEffect(() => {
    if (lastSyncedAt) localStorage.setItem(LAST_SYNC_KEY, lastSyncedAt)
    else localStorage.removeItem(LAST_SYNC_KEY)
  }, [lastSyncedAt])

  useEffect(() => {
    let active = true
    const sync = async () => {
      setIsSyncing(true)
      try {
        const incoming = await loadSheetBooks()
        if (!active) return
        const merged = mergeBooks(booksRef.current, incoming, localStorage.getItem(DEMO_KEY) !== 'false')
        const classified = await lookupBookKinds(merged)
        if (!active) return
        setBooks(mergeBooks(booksRef.current, classified, false))
        setIsDemo(false)
        setLastSyncedAt(new Date().toISOString())
        setNotice('')
      } catch (error) {
        if (active) setNotice(error instanceof Error ? error.message : 'Google Sheets sync failed.')
      } finally {
        if (active) setIsSyncing(false)
      }
    }

    void sync()
    const interval = window.setInterval(() => { void sync() }, 15 * 60 * 1000)
    return () => {
      active = false
      window.clearInterval(interval)
    }
  }, [syncVersion])

  const categories = useMemo(() => {
    const values = new Set([...customCategories, ...books.map((book) => book.category).filter((category) => category !== uncategorized)])
    return [...values].sort((a, b) => a.localeCompare(b))
  }, [books, customCategories])

  const filteredBooks = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase()
    return books
      .filter((book) => activeCategory === 'All books' || book.category === activeCategory)
      .filter((book) => !normalizedQuery || `${book.title} ${book.author} ${book.category} ${book.shelves.join(' ')} ${(book.tags ?? []).join(' ')}`.toLowerCase().includes(normalizedQuery))
      .sort((a, b) => {
        if (sortBy === 'title') return a.title.localeCompare(b.title)
        if (sortBy === 'author') return a.author.localeCompare(b.author)
        if (sortBy === 'rating') return b.rating - a.rating || a.title.localeCompare(b.title)
        return (Date.parse(b.dateRead) || 0) - (Date.parse(a.dateRead) || 0) || a.title.localeCompare(b.title)
      })
  }, [activeCategory, books, query, sortBy])

  const ratedBooks = books.filter((book) => book.rating > 0)
  const averageRating = ratedBooks.length
    ? (ratedBooks.reduce((sum, book) => sum + book.rating, 0) / ratedBooks.length).toFixed(1)
    : '—'
  const readingYears = [...new Set(books.map((book) => book.dateRead.match(/^(\d{4})/)?.[1]).filter((year): year is string => Boolean(year)))].sort((a, b) => Number(b) - Number(a))
  const readingYear = readingYears.includes(selectedReadingYear) ? selectedReadingYear : readingYears[0] ?? ''
  const overallMix = bookMix(books)
  const yearlyMix = bookMix(books.filter((book) => book.dateRead.startsWith(readingYear)))
  const overallFormatMix = formatMix(books)
  const yearlyFormatMix = formatMix(books.filter((book) => book.dateRead.startsWith(readingYear)))

  function updateCategory(id: string, category: string) {
    setBooks((current) => current.map((book) => book.id === id ? { ...book, category } : book))
  }

  function updateBookKind(id: string, kind: BookKind) {
    setBooks((current) => current.map((book) => book.id === id
      ? { ...book, kind, kindSource: 'manual', kindCheckedAt: Date.now() }
      : book))
  }

  function addTag(event: React.FormEvent<HTMLFormElement>, book: Book) {
    event.preventDefault()
    const tag = tagDraft.trim()
    if (!tag) return
    setBooks((current) => current.map((item) => item.id === book.id && !(item.tags ?? []).some((existing) => existing.toLowerCase() === tag.toLowerCase())
      ? { ...item, tags: [...(item.tags ?? []), tag] }
      : item))
    setTagDraft('')
    setAddingTagBookId('')
  }

  function removeTag(bookId: string, tagToRemove: string) {
    setBooks((current) => current.map((book) => book.id === bookId
      ? { ...book, tags: (book.tags ?? []).filter((tag) => tag !== tagToRemove) }
      : book))
  }

  function addCategory(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const category = categoryDraft.trim()
    if (!category) return
    if (!categories.some((item) => item.toLowerCase() === category.toLowerCase())) {
      setCustomCategories((current) => [...current, category])
    }
    setActiveCategory(category)
    setCategoryDraft('')
    setIsAddingCategory(false)
  }

  function importCsv(file?: File) {
    if (!file) return
    Papa.parse<Record<string, string>>(file, {
      header: true,
      skipEmptyLines: 'greedy',
      transformHeader: (header) => header.trim(),
      complete: ({ data, errors, meta }) => {
        const headers = (meta.fields ?? []).map(normalizeHeader)
        if (!headers.includes('title')) {
          setNotice('This file does not look like a Goodreads export. Choose the CSV from your Goodreads library export.')
          return
        }

        const importedBooks = data.map((row) => bookFromRow(row)).filter((book): book is Book => book !== null)
        if (importedBooks.length === 0) {
          setNotice('No books on the read shelf were found. Check that your Goodreads export includes the Exclusive Shelf column.')
          return
        }

        const startingBooks = isDemo ? [] : books
        setBooks(mergeBooks(startingBooks, importedBooks, false))
        setIsDemo(false)
        setActiveCategory('All books')
        setQuery('')
        setNotice(`Added ${importedBooks.length} read ${importedBooks.length === 1 ? 'book' : 'books'} from ${file.name}${errors.length ? ' with a few skipped rows' : ''}.`)
      },
      error: () => setNotice('The CSV could not be read. Try exporting your Goodreads library again.'),
    })
  }

  const categoryCount = (category: string) => books.filter((book) => book.category === category).length

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <a className="brand" href="#library" aria-label="Shelf Notes home">
          <span className="brand-mark"><BookOpen size={19} strokeWidth={2.2} /></span>
          <span>shelf<span className="brand-light">notes</span></span>
        </a>

        <div className="side-label">YOUR LIBRARY</div>
        <button className={`side-link ${activeCategory === 'All books' ? 'active' : ''}`} onClick={() => setActiveCategory('All books')}>
          <Library size={17} /> <span>All books</span><span className="side-count">{books.length}</span>
        </button>

        <div className="category-heading">
          <span className="side-label">CATEGORIES</span>
          <button className="icon-button add-category" onClick={() => setIsAddingCategory((current) => !current)} aria-label="Add category" title="Add category">
            {isAddingCategory ? <X size={15} /> : <Plus size={16} />}
          </button>
        </div>
        {isAddingCategory && (
          <form className="new-category-form" onSubmit={addCategory}>
            <input autoFocus value={categoryDraft} onChange={(event) => setCategoryDraft(event.target.value)} placeholder="Category name" aria-label="New category name" />
            <button type="submit" aria-label="Save category"><Check size={15} /></button>
          </form>
        )}
        <nav className="category-nav" aria-label="Book categories">
          {categories.map((category, index) => (
            <button key={category} className={`side-link ${activeCategory === category ? 'active' : ''}`} onClick={() => setActiveCategory(category)}>
              <span className={`category-dot dot-${index % 6}`} />
              <span className="category-name">{category}</span>
              <span className="side-count">{categoryCount(category)}</span>
            </button>
          ))}
          {books.some((book) => book.category === uncategorized) && (
            <button className={`side-link ${activeCategory === uncategorized ? 'active' : ''}`} onClick={() => setActiveCategory(uncategorized)}>
              <span className="category-dot dot-muted" /><span className="category-name">{uncategorized}</span><span className="side-count">{categoryCount(uncategorized)}</span>
            </button>
          )}
        </nav>

      </aside>

      <main className="main-content" id="library">
        <header className="topbar">
          <div className="topbar-right">
            <a className="sheet-profile-link" href={GOOGLE_SHEET_URL} target="_blank" rel="noreferrer">Reading sheet</a>
            {lastSyncedAt && <span className="sync-status">Synced {new Date(lastSyncedAt).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}</span>}
            <button className="sync-button sync-button-icon" onClick={() => setSyncVersion((version) => version + 1)} disabled={isSyncing} aria-label={isSyncing ? 'Syncing sheet' : 'Sync sheet'} title={isSyncing ? 'Syncing sheet' : 'Sync sheet'}>
              <RefreshCw size={15} className={isSyncing ? 'syncing-icon' : ''} />
            </button>
            <label htmlFor="goodreads-file" className="import-button"><Upload size={16} /> Import CSV</label>
            <input ref={fileInput} id="goodreads-file" className="file-input" type="file" accept=".csv,text/csv" onChange={(event) => { importCsv(event.target.files?.[0]); event.target.value = '' }} />
          </div>
        </header>

        <section className="page-intro">
          <div>
            <h1>Your library</h1>
          </div>
          <div className="intro-illustration" aria-hidden="true">
            <div className="sun-disc" />
            <div className="book-stack stack-back" />
            <div className="book-stack stack-middle" />
            <div className="book-stack stack-front"><span /></div>
            <span className="spark spark-one">✳</span><span className="spark spark-two">✳</span>
          </div>
        </section>

        {isDemo && <div className="demo-notice"><span><Star size={15} fill="currentColor" /> Sample data</span></div>}
        {notice && <div className="notice" role="status"><span>{notice}</span><button className="icon-button" onClick={() => setNotice('')} aria-label="Dismiss message"><X size={16} /></button></div>}

        <section className="stats-row" aria-label="Library statistics">
          <div className="stat-item"><span className="stat-number">{books.length}</span><span className="stat-label">books read</span></div>
          <span className="stat-divider" />
          <div className="stat-item"><span className="stat-number">{categories.length}</span><span className="stat-label">categories</span></div>
          <span className="stat-divider" />
          <div className="stat-item"><span className="stat-number stat-rating"><Star size={17} fill="currentColor" />{averageRating}</span><span className="stat-label">average rating</span></div>
        </section>

        <section className="reading-mix" aria-labelledby="reading-mix-title">
          <div className="reading-mix-heading">
            <h2 id="reading-mix-title">Fiction &amp; nonfiction</h2>
            <label className="year-picker">
              <span>Year</span>
              <select value={readingYear} onChange={(event) => setSelectedReadingYear(event.target.value)} aria-label="Compare year">
                {readingYears.map((year) => <option key={year} value={year}>{year}</option>)}
              </select>
              <ChevronDown size={13} />
            </label>
          </div>
          <div className="reading-mix-grid">
            {[
              { label: 'Overall', mix: overallMix, total: books.length },
              { label: readingYear || 'Selected year', mix: yearlyMix, total: books.filter((book) => book.dateRead.startsWith(readingYear)).length },
            ].map(({ label, mix, total }) => {
              const classified = mix.fiction + mix.nonfiction
              const fictionPercent = mixPercent(mix.fiction, classified)
              const nonfictionPercent = classified ? 100 - fictionPercent : 0
              return (
                <div className="reading-mix-item" key={label}>
                  <div className="mix-item-heading"><h3>{label}</h3><span>{classified} / {total} classified</span></div>
                  <div className={`mix-bar ${classified ? '' : 'mix-bar-empty'}`} role="img" aria-label={`${label}: ${fictionPercent}% fiction, ${nonfictionPercent}% nonfiction, ${mix.unclear} unclear`}>
                    {classified > 0 && <>
                      <span className="mix-fiction" style={{ width: `${fictionPercent}%` }} />
                      <span className="mix-nonfiction" style={{ width: `${nonfictionPercent}%` }} />
                    </>}
                  </div>
                  <div className="mix-labels">
                    {classified > 0 ? <>
                      <span><i className="mix-dot mix-dot-fiction" />Fiction <strong>{fictionPercent}%</strong></span>
                      <span><i className="mix-dot mix-dot-nonfiction" />Nonfiction <strong>{nonfictionPercent}%</strong></span>
                    </> : <span>No classified books</span>}
                    <span className="mix-unclear">{mix.unclear} unclear</span>
                  </div>
                </div>
              )
            })}
          </div>
        </section>

        <section className="reading-mix format-mix" aria-labelledby="format-mix-title">
          <div className="reading-mix-heading">
            <h2 id="format-mix-title">Audio, physical &amp; Kindle</h2>
          </div>
          <div className="reading-mix-grid">
            {[
              { label: 'Overall', mix: overallFormatMix, total: books.length },
              { label: readingYear || 'Selected year', mix: yearlyFormatMix, total: books.filter((book) => book.dateRead.startsWith(readingYear)).length },
            ].map(({ label, mix, total }) => {
              const classified = mix.audio + mix.physical + mix.kindle
              const audioPercent = mixPercent(mix.audio, classified)
              const physicalPercent = mixPercent(mix.physical, classified)
              const kindlePercent = classified ? 100 - audioPercent - physicalPercent : 0
              return (
                <div className="reading-mix-item" key={label}>
                  <div className="mix-item-heading"><h3>{label}</h3><span>{classified} / {total} classified</span></div>
                  <div className={`mix-bar ${classified ? '' : 'mix-bar-empty'}`} role="img" aria-label={`${label}: ${audioPercent}% audio, ${physicalPercent}% physical, ${kindlePercent}% Kindle, ${mix.unclear} unclear`}>
                    {classified > 0 && <>
                      <span className="mix-audio" style={{ width: `${audioPercent}%` }} />
                      <span className="mix-physical" style={{ width: `${physicalPercent}%` }} />
                      <span className="mix-kindle" style={{ width: `${kindlePercent}%` }} />
                    </>}
                  </div>
                  <div className="mix-labels">
                    {classified > 0 ? <>
                      <span><i className="mix-dot mix-dot-audio" />Audio <strong>{audioPercent}%</strong></span>
                      <span><i className="mix-dot mix-dot-physical" />Physical <strong>{physicalPercent}%</strong></span>
                      <span><i className="mix-dot mix-dot-kindle" />Kindle <strong>{kindlePercent}%</strong></span>
                    </> : <span>No format data</span>}
                    <span className="mix-unclear">{mix.unclear} unclear</span>
                  </div>
                </div>
              )
            })}
          </div>
        </section>

        <section className="collection-section">
          <div className="collection-heading">
            <div>
              <h2>{activeCategory}<span className="heading-count">{filteredBooks.length}</span></h2>
            </div>
            <div className="collection-actions">
              <label className="search-box">
                <Search size={16} />
                <input type="search" placeholder="Search books" value={query} onChange={(event) => setQuery(event.target.value)} aria-label="Search books and authors" />
                {query && <button className="search-clear" onClick={() => setQuery('')} aria-label="Clear search"><X size={14} /></button>}
              </label>
              <label className="sort-select"><ArrowDownUp size={15} /><select value={sortBy} onChange={(event) => setSortBy(event.target.value)} aria-label="Sort books"><option value="recent">Recently read</option><option value="title">Title</option><option value="author">Author</option><option value="rating">Rating</option></select><ChevronDown size={13} /></label>
            </div>
          </div>

          {filteredBooks.length ? (
            <div className="book-list">
              {filteredBooks.map((book, index) => (
                <article className="book-row" key={book.id}>
                  <BookCover book={book} index={index} />
                  <div className="book-info">
                    <h3>{book.title}</h3>
                    <p className="book-author">{book.author}</p>
                    <div className="book-meta">
                      {book.year && <span>{book.year}</span>}
                      {book.pages && <><span className="meta-divider">·</span><span>{book.pages} pages</span></>}
                      {book.dateRead && <><span className="meta-divider">·</span><span>Finished {formatFinishedDate(book.dateRead)}</span></>}
                    </div>
                    <div className="book-tags" aria-label={`Tags for ${book.title}`}>
                      {(book.tags ?? []).map((tag) => (
                        <span className="book-tag" key={tag}>
                          {tag}
                          <button type="button" onClick={() => removeTag(book.id, tag)} aria-label={`Remove ${tag} tag from ${book.title}`} title={`Remove ${tag}`}><X size={11} /></button>
                        </span>
                      ))}
                      {addingTagBookId === book.id ? (
                        <form className="add-tag-form" onSubmit={(event) => addTag(event, book)}>
                          <input autoFocus value={tagDraft} onChange={(event) => setTagDraft(event.target.value)} onKeyDown={(event) => { if (event.key === 'Escape') { setAddingTagBookId(''); setTagDraft('') } }} placeholder="Add tag" aria-label={`New tag for ${book.title}`} />
                          <button type="submit" aria-label={`Save tag for ${book.title}`}><Check size={12} /></button>
                          <button type="button" onClick={() => { setAddingTagBookId(''); setTagDraft('') }} aria-label="Cancel adding tag"><X size={12} /></button>
                        </form>
                      ) : (
                        <button className="add-book-tag" type="button" onClick={() => { setAddingTagBookId(book.id); setTagDraft('') }} aria-label={`Add tag to ${book.title}`} title="Add tag"><Plus size={12} /></button>
                      )}
                    </div>
                  </div>
                  <div className="book-rating" aria-label={book.rating ? `Rated ${book.rating} out of 5` : 'Not rated'}>
                    {book.rating ? <><Star size={14} fill="currentColor" /><span>{book.rating}.0</span></> : <span className="unrated">Not rated</span>}
                  </div>
                  <div className="book-controls">
                    <label className="book-kind-select-wrap">
                      <select value={book.kind ?? 'Unclear'} onChange={(event) => updateBookKind(book.id, event.target.value as BookKind)} aria-label={`Type for ${book.title}`}>
                        <option value="Unclear">Unclear</option>
                        <option value="Fiction">Fiction</option>
                        <option value="Nonfiction">Nonfiction</option>
                      </select>
                      <ChevronDown size={13} />
                    </label>
                    <label className="category-select-wrap">
                      <select value={book.category} onChange={(event) => updateCategory(book.id, event.target.value)} aria-label={`Category for ${book.title}`}>
                        <option value={uncategorized}>{uncategorized}</option>
                        {categories.map((category) => <option key={category} value={category}>{category}</option>)}
                      </select>
                      <ChevronDown size={13} />
                    </label>
                  </div>
                </article>
              ))}
            </div>
          ) : (
            <div className="empty-state">
              <div className="empty-icon"><BookOpen size={24} /></div>
              <h3>{books.length ? 'No matches' : 'No books yet'}</h3>
              {books.length ? <button className="text-button" onClick={() => { setQuery(''); setActiveCategory('All books') }}>Clear filters</button> : <label htmlFor="goodreads-file" className="import-button"><Upload size={16} /> Choose Goodreads CSV</label>}
            </div>
          )}

          <footer className="list-footer"><span>{filteredBooks.length} of {books.length} books</span></footer>
        </section>
      </main>
    </div>
  )
}

export default App