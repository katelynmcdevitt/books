# Shelf Notes

A small, local-first reading library. Sync a Google Sheets reading log, organize finished books, and find them again with search and sorting.

## Run locally

```sh
npm install
npm run dev
```

## Sync the reading sheet

The app reads the **2026**, **2025**, **2024**, and **Prev Years** tabs from Katelyn's [reading sheet](https://docs.google.com/spreadsheets/d/1gLdN5dpgPDGgn_HA4Ll0gAUOSftuFmY9yMxQALSB_UY/edit). The CSV export must be viewable by anyone with the link. The development server proxies those exports to avoid browser CORS restrictions.

Shelf Notes syncs when opened, every 15 minutes while open, or when you select **Sync**. Month heading rows provide a month/year finish date. Sheet columns include title, author, format, nonfiction status, and rating. Tags and manual type/category changes are preserved across syncs.

Books with ISBNs are classified as fiction or nonfiction using Open Library subject data. Missing or ambiguous metadata stays **Unclear**. You can change a book's type manually; that choice is preserved through future syncs. ISBN lookups go directly from your browser to Open Library.

Books and categories are stored in this browser's local storage. Nothing is uploaded to a Shelf Notes server. Clearing browser storage removes your library, so keep your Goodreads export as a backup.