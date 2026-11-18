export default function ShelfBookRows({ books, onToggle, actionLabel="取消选择" }) {
 return <div className="shelf-workspace-books">{[...books].reverse().map(book=>{
  const content=<><span className="shelf-row-title" title={book.title}>{book.title}</span><span className="shelf-row-author" title={book.author||''}>{book.author==='本地导入'?'':book.author}</span></>;
  return onToggle?<button className="shelf-book-row" key={book.id} onClick={()=>onToggle(book)} aria-label={`${actionLabel}《${book.title}》`}>{content}</button>:<div className="shelf-book-row" key={book.id}>{content}</div>;
 })}</div>;
}
