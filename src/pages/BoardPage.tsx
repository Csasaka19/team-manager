import { BoardView } from '@/components/board/BoardView'
import { useDocumentTitle } from '@/hooks/useDocumentTitle'
import { useScrollRestore } from '@/hooks/useScrollRestore'

export default function BoardPage() {
  useDocumentTitle('Board')
  useScrollRestore()

  // The board claims a fixed viewport-relative height so each column
  // can scroll its own card list. Math: viewport - top bar (56px) -
  // Layout vertical padding (24/32 each side).
  return (
    <div className="flex h-[calc(100vh-104px)] flex-col gap-3 md:h-[calc(100vh-120px)] md:gap-4">
      <header className="shrink-0">
        <h1 className="text-2xl font-semibold text-[var(--text-primary)]">
          Board
        </h1>
        <p className="mt-1 text-sm text-[var(--text-secondary)]">
          Drag cards between columns to update status.
        </p>
      </header>
      <BoardView />
    </div>
  )
}
