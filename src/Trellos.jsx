import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { DragDropContext, Droppable, Draggable } from '@hello-pangea/dnd'
import { supabase } from './supabaseClient'

const CARD_COLORS = [
  'bg-slate-700', 'bg-blue-600', 'bg-emerald-600', 'bg-yellow-600',
  'bg-red-600', 'bg-purple-600', 'bg-indigo-600', 'bg-pink-600'
]

const BOARD_ICONS = ['📁', '🚀', '🎓', '💼', '💡', '🎮', '🏠', '❤️']

export default function Trellos() {
  const navigate = useNavigate()
  const [user, setUser] = useState(null)
  const [loading, setLoading] = useState(true)
  
  // Estados de Navegación
  const [activeBoard, setActiveBoard] = useState(null)
  const [showTrash, setShowTrash] = useState(false)
  
  // Datos
  const [boards, setBoards] = useState([])
  const [columns, setColumns] = useState([])
  const [cards, setCards] = useState([])
  
  // Estados UI
  const [isCreatingBoard, setIsCreatingBoard] = useState(false)
  const [newBoardTitle, setNewBoardTitle] = useState('')
  const [newBoardIcon, setNewBoardIcon] = useState('📁')
  
  const [isCreatingColumn, setIsCreatingColumn] = useState(false)
  const [newColumnName, setNewColumnName] = useState('')
  const [newCardInputs, setNewCardInputs] = useState({})
  
  // Estado del Modal
  const [modalCard, setModalCard] = useState(null)

  // Carga inicial de usuario y tableros
  useEffect(() => {
    supabase.auth.getUser().then(({ data: { user: u } }) => {
      setUser(u ?? null)
      if (u) fetchBoards(u.id)
    })
  }, [])

  // Cargar columnas y tarjetas al abrir un tablero
  useEffect(() => {
    if (activeBoard && user) fetchBoardContent(activeBoard.id)
  }, [activeBoard, user])

  // ==============================
  // FETCHING DATA
  // ==============================
  const fetchBoards = async (userId) => {
    setLoading(true)
    const { data } = await supabase.from('trellos_boards').select('*').eq('user_id', userId).order('created_at', { ascending: false })
    if (data) setBoards(data)
    setLoading(false)
  }

  const fetchBoardContent = async (boardId) => {
    setLoading(true)
    const { data: cols } = await supabase.from('trellos_columns').select('*').eq('board_id', boardId).order('position', { ascending: true })
    if (cols) {
      setColumns(cols)
      if (cols.length > 0) {
        const { data: c } = await supabase.from('trellos_cards').select('*').in('column_id', cols.map(col => col.id)).order('position', { ascending: true })
        if (c) setCards(c)
      } else {
        setCards([])
      }
    }
    setLoading(false)
  }

  // ==============================
  // TABLEROS (BOARDS)
  // ==============================
  const handleCreateBoard = async (e) => {
    e.preventDefault()
    if (!newBoardTitle.trim() || !user) return
    const { data } = await supabase.from('trellos_boards').insert([{ user_id: user.id, title: newBoardTitle, icon: newBoardIcon }]).select()
    if (data) {
      setBoards([data[0], ...boards])
      setNewBoardTitle('')
      setIsCreatingBoard(false)
    }
  }

  const toggleTrashBoard = async (e, id, toTrash) => {
    e.stopPropagation()
    setBoards(boards.map(b => b.id === id ? { ...b, is_trashed: toTrash } : b))
    await supabase.from('trellos_boards').update({ is_trashed: toTrash }).eq('id', id)
  }

  const permanentlyDeleteBoard = async (e, id) => {
    e.stopPropagation()
    if (!window.confirm("¿Destruir tablero para siempre?")) return
    setBoards(boards.filter(b => b.id !== id))
    await supabase.from('trellos_boards').delete().eq('id', id)
  }

  // ==============================
  // COLUMNAS Y TARJETAS (CARDS)
  // ==============================
  const handleAddColumn = async (e) => {
    e.preventDefault()
    if (!newColumnName.trim() || !activeBoard) return
    const newPos = columns.length > 0 ? Math.max(...columns.map(c => c.position)) + 1 : 0
    const { data } = await supabase.from('trellos_columns').insert([{ board_id: activeBoard.id, name: newColumnName, position: newPos }]).select()
    if (data) {
      setColumns([...columns, data[0]])
      setNewColumnName('')
      setIsCreatingColumn(false)
    }
  }

  const handleCreateCard = async (columnId) => {
    const title = newCardInputs[columnId]?.trim()
    if (!title) return
    const cardsInCol = cards.filter(c => c.column_id === columnId && !c.is_trashed)
    const newPos = cardsInCol.length > 0 ? Math.max(...cardsInCol.map(c => c.position)) + 1 : 0
    
    const { data } = await supabase.from('trellos_cards')
      .insert([{ column_id: columnId, title, content: '', position: newPos }]).select()
    
    if (data) {
      setCards([...cards, data[0]])
      setNewCardInputs(prev => ({ ...prev, [columnId]: '' }))
    }
  }

  const toggleTrashCard = async (e, id, toTrash) => {
    e?.stopPropagation()
    setCards(cards.map(c => c.id === id ? { ...c, is_trashed: toTrash } : c))
    await supabase.from('trellos_cards').update({ is_trashed: toTrash }).eq('id', id)
  }

  const permanentlyDeleteCard = async (e, id) => {
    e?.stopPropagation()
    setCards(cards.filter(c => c.id !== id))
    await supabase.from('trellos_cards').delete().eq('id', id)
  }

  const toggleCardCompletion = async (e, id, currentStatus) => {
    e.stopPropagation() // Evita que se abra el modal
    const newStatus = !currentStatus
    setCards(cards.map(c => c.id === id ? { ...c, is_completed: newStatus } : c))
    await supabase.from('trellos_cards').update({ is_completed: newStatus }).eq('id', id)
    // Si editamos desde el modal, actualizar estado local del modal también
    if (modalCard?.id === id) setModalCard({ ...modalCard, is_completed: newStatus })
  }

  // ==============================
  // DRAG & DROP (@hello-pangea/dnd)
  // ==============================
  const onDragEnd = async (result) => {
    const { destination, source, draggableId } = result
    if (!destination) return
    if (destination.droppableId === source.droppableId && destination.index === source.index) return

    const cardId = parseInt(draggableId)
    const sourceColId = parseInt(source.droppableId)
    const destColId = parseInt(destination.droppableId)

    // Clonar tarjetas activas para la manipulación
    let activeCards = cards.filter(c => !c.is_trashed)
    const cardToMove = activeCards.find(c => c.id === cardId)
    
    // Quitar de la lista original
    activeCards = activeCards.filter(c => c.id !== cardId)
    
    // Obtener las tarjetas de la columna de destino ordenadas por posicion
    let destCards = activeCards.filter(c => c.column_id === destColId).sort((a,b) => a.position - b.position)
    
    // Insertar en nueva posición
    destCards.splice(destination.index, 0, { ...cardToMove, column_id: destColId })

    // Reconstruir array con las nuevas posiciones
    const finalCards = []
    const cardsToUpdate = []

    columns.forEach(col => {
      let colCards = col.id === destColId ? destCards : activeCards.filter(c => c.column_id === col.id).sort((a,b) => a.position - b.position)
      colCards.forEach((c, idx) => {
        finalCards.push({ ...c, position: idx, column_id: col.id })
        if (c.id === cardId || c.position !== idx || c.column_id !== col.id) {
          cardsToUpdate.push({ id: c.id, position: idx, column_id: col.id })
        }
      })
    })

    // Actualizar estado local (optimista)
    setCards([...finalCards, ...cards.filter(c => c.is_trashed)])

    // Actualizar Supabase
    for (let c of cardsToUpdate) {
      await supabase.from('trellos_cards').update({ position: c.position, column_id: c.column_id }).eq('id', c.id)
    }
  }

  // ==============================
  // MODAL DE EDICIÓN
  // ==============================
  const closeAndSaveModal = async () => {
    if (!modalCard) return
    // Actualizar localmente
    setCards(cards.map(c => c.id === modalCard.id ? modalCard : c))
    // Guardar en DB
    await supabase.from('trellos_cards').update({
      title: modalCard.title,
      content: modalCard.content,
      color: modalCard.color,
      is_completed: modalCard.is_completed
    }).eq('id', modalCard.id)
    setModalCard(null)
  }

  // ==============================
  // RENDERIZADO
  // ==============================
  const activeB = boards.filter(b => !b.is_trashed)
  const trashedB = boards.filter(b => b.is_trashed)
  const activeC = cards.filter(c => !c.is_trashed)
  const trashedC = cards.filter(c => c.is_trashed)

  return (
    <div className="min-h-screen bg-slate-900 text-white font-sans transition-all duration-300">
      {/* HEADER PRINCIPAL */}
      <header className="sticky top-0 z-20 bg-slate-900/95 backdrop-blur-sm border-b border-slate-700 px-4 py-3 sm:px-6 flex items-center justify-between">
        <div className="flex items-center gap-4">
          <button onClick={() => { activeBoard ? setActiveBoard(null) : navigate('/') }} className="text-slate-400 hover:text-white transition-colors duration-300 text-2xl">
            &larr;
          </button>
          <h1 className="text-xl font-black bg-gradient-to-r from-emerald-400 to-blue-500 bg-clip-text text-transparent">
            {activeBoard ? `${activeBoard.icon} ${activeBoard.title}` : 'Mis Trellos'}
          </h1>
        </div>
        <button onClick={() => setShowTrash(!showTrash)} className={`px-4 py-2 rounded-lg text-sm font-bold transition-all duration-300 ${showTrash ? 'bg-red-500/20 text-red-400 border border-red-500/30' : 'bg-slate-800 text-slate-300 hover:text-white border border-slate-700 hover:border-slate-500'}`}>
          {showTrash ? 'Salir de Papelera' : '🗑️ Papelera'}
        </button>
      </header>

      {loading ? (
        <div className="flex justify-center p-20"><p className="animate-pulse text-slate-500">Cargando datos...</p></div>
      ) : (
        <main className="p-4 sm:p-6 h-[calc(100vh-70px)]">
          
          {/* =========================================
              NIVEL 1: MIS TABLEROS 
              ========================================= */}
          {!activeBoard && (
            <div className="max-w-7xl mx-auto">
              {showTrash ? (
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
                  {trashedB.length === 0 && <p className="text-slate-500 col-span-full">No hay tableros en la papelera.</p>}
                  {trashedB.map(board => (
                    <div key={board.id} className="bg-slate-800/50 p-6 rounded-2xl border border-red-900/50 opacity-70">
                      <h2 className="text-xl font-bold mb-4 text-slate-400">{board.icon} {board.title}</h2>
                      <div className="flex gap-2">
                        <button onClick={(e) => toggleTrashBoard(e, board.id, false)} className="flex-1 bg-emerald-600/20 text-emerald-400 py-2 rounded hover:bg-emerald-600 hover:text-white font-bold text-sm">Restaurar</button>
                        <button onClick={(e) => permanentlyDeleteBoard(e, board.id)} className="flex-1 bg-red-600/20 text-red-400 py-2 rounded hover:bg-red-600 hover:text-white font-bold text-sm">Destruir</button>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
                  {/* Crear Tablero */}
                  {isCreatingBoard ? (
                    <form onSubmit={handleCreateBoard} className="bg-slate-800 p-6 rounded-2xl border border-emerald-500 shadow-[0_0_15px_rgba(16,185,129,0.2)]">
                      <div className="flex gap-2 mb-4 overflow-x-auto pb-2 scrollbar-thin">
                        {BOARD_ICONS.map(icon => (
                          <button key={icon} type="button" onClick={() => setNewBoardIcon(icon)} className={`text-2xl p-2 rounded-lg transition-colors ${newBoardIcon === icon ? 'bg-slate-700 border border-emerald-500' : 'hover:bg-slate-700'}`}>{icon}</button>
                        ))}
                      </div>
                      <input autoFocus type="text" value={newBoardTitle} onChange={(e) => setNewBoardTitle(e.target.value)} placeholder="Nombre del tablero..." className="w-full bg-slate-900 border border-slate-600 rounded-lg p-3 mb-4 text-white outline-none focus:border-emerald-500" />
                      <div className="flex gap-2">
                        <button type="submit" className="flex-1 bg-emerald-600 text-white font-bold py-2 rounded-lg hover:bg-emerald-500">Crear</button>
                        <button type="button" onClick={() => setIsCreatingBoard(false)} className="flex-1 bg-slate-700 text-slate-300 font-bold py-2 rounded-lg hover:bg-slate-600">Cancelar</button>
                      </div>
                    </form>
                  ) : (
                    <div onClick={() => setIsCreatingBoard(true)} className="bg-slate-800/50 border border-dashed border-slate-600 rounded-2xl flex flex-col items-center justify-center p-6 cursor-pointer hover:border-emerald-500 transition-all min-h-[160px] group">
                      <span className="text-4xl mb-2 text-slate-500 group-hover:scale-110 transition-transform">+</span>
                      <span className="text-slate-400 font-bold">Nuevo Tablero</span>
                    </div>
                  )}

                  {/* Lista de Tableros */}
                  {activeB.map(board => (
                    <div key={board.id} onClick={() => { setActiveBoard(board); setShowTrash(false) }} className="group bg-slate-800 p-6 rounded-2xl border border-slate-700 hover:border-emerald-500 hover:shadow-[0_0_20px_rgba(16,185,129,0.2)] cursor-pointer transition-all min-h-[160px] flex flex-col justify-between relative">
                      <button onClick={(e) => toggleTrashBoard(e, board.id, true)} className="absolute top-4 right-4 text-slate-500 hover:text-red-400 opacity-0 group-hover:opacity-100 transition-opacity p-2" title="Borrar">✖</button>
                      <div>
                        <div className="text-4xl mb-3 group-hover:scale-110 transition-transform origin-left">{board.icon}</div>
                        <h2 className="text-xl font-bold">{board.title}</h2>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* =========================================
              NIVEL 2: DENTRO DEL TABLERO (COLUMNS/CARDS)
              ========================================= */}
          {activeBoard && (
            <div className="h-full flex overflow-x-auto gap-4 pb-4 scrollbar-thin items-start">
              {showTrash ? (
                // Papelera de Tarjetas
                <div className="flex flex-wrap gap-4 w-full">
                  {trashedC.length === 0 && <p className="text-slate-500 mt-10 w-full text-center">La papelera de este tablero está vacía.</p>}
                  {trashedC.map(card => (
                    <div key={card.id} className={`${card.color} opacity-80 p-4 rounded-xl border border-slate-700 w-72`}>
                      <div className="flex justify-end gap-2 mb-2">
                        <button onClick={() => toggleTrashCard(null, card.id, false)} className="bg-black/40 text-emerald-400 hover:text-emerald-300 px-2 py-1 rounded text-xs font-bold">♻️ Restaurar</button>
                        <button onClick={() => permanentlyDeleteCard(null, card.id)} className="bg-black/40 text-red-400 hover:text-red-300 px-2 py-1 rounded text-xs font-bold">✖</button>
                      </div>
                      <h3 className="font-bold text-lg text-white">{card.title}</h3>
                    </div>
                  ))}
                </div>
              ) : (
                // Board Activo con react-beautiful-dnd
                <DragDropContext onDragEnd={onDragEnd}>
                  {columns.map(column => (
                    <div key={column.id} className="bg-slate-800/80 p-3 rounded-2xl border border-slate-700 min-w-[320px] w-[320px] shadow-xl flex flex-col max-h-full">
                      <h2 className="text-base font-bold mb-3 px-2 text-slate-200">{column.name} <span className="text-slate-500 text-sm ml-1">({activeC.filter(c => c.column_id === column.id).length})</span></h2>
                      
                      <Droppable droppableId={column.id.toString()}>
                        {(provided, snapshot) => (
                          <div {...provided.droppableProps} ref={provided.innerRef} className={`flex-1 overflow-y-auto min-h-[50px] space-y-2 p-1 rounded-xl transition-colors ${snapshot.isDraggingOver ? 'bg-slate-700/30' : ''}`}>
                            {activeC.filter(c => c.column_id === column.id).sort((a,b) => a.position - b.position).map((card, index) => (
                              <Draggable key={card.id.toString()} draggableId={card.id.toString()} index={index}>
                                {(provided, snapshot) => (
                                  <div
                                    ref={provided.innerRef}
                                    {...provided.draggableProps}
                                    {...provided.dragHandleProps}
                                    onClick={() => setModalCard(card)}
                                    className={`group ${card.color} p-3 rounded-xl shadow-md relative cursor-pointer hover:ring-2 hover:ring-white/20 transition-all ${snapshot.isDragging ? 'shadow-2xl scale-105 rotate-2' : ''} ${card.is_completed ? 'opacity-60' : ''}`}
                                  >
                                    <div className="flex items-start gap-3">
                                      {/* Checkbox */}
                                      <button onClick={(e) => toggleCardCompletion(e, card.id, card.is_completed)} className={`mt-0.5 w-5 h-5 rounded-md border flex-shrink-0 flex items-center justify-center transition-colors ${card.is_completed ? 'bg-emerald-500 border-emerald-500' : 'bg-black/20 border-white/30 hover:border-white'}`}>
                                        {card.is_completed && <span className="text-white text-xs leading-none">✔</span>}
                                      </button>
                                      
                                      <div className="flex-1 min-w-0">
                                        <h4 className={`font-semibold text-sm text-white break-words ${card.is_completed ? 'line-through' : ''}`}>{card.title}</h4>
                                        {card.content && <div className="mt-2 w-full h-1.5 bg-white/20 rounded-full" title="Tiene descripción" />}
                                      </div>
                                    </div>
                                    {/* Botón borrar (hover) */}
                                    <button onClick={(e) => toggleTrashCard(e, card.id, true)} className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 bg-black/40 hover:bg-red-500/80 text-white w-6 h-6 rounded flex items-center justify-center text-xs transition-all">✖</button>
                                  </div>
                                )}
                              </Draggable>
                            ))}
                            {provided.placeholder}
                          </div>
                        )}
                      </Droppable>

                      {/* Footer: Input nueva tarjeta */}
                      <div className="mt-3 bg-slate-900/50 p-2 rounded-xl border border-slate-700/50">
                        <input type="text" placeholder="+ Añadir tarjeta..." value={newCardInputs[column.id] || ''} onChange={(e) => setNewCardInputs({ ...newCardInputs, [column.id]: e.target.value })} onKeyDown={(e) => { if (e.key === 'Enter') handleCreateCard(column.id) }} className="w-full bg-transparent text-sm text-white placeholder-slate-500 outline-none p-1 focus:text-blue-400 transition-colors" />
                      </div>
                    </div>
                  ))}

                  {/* Añadir Columna */}
                  <div className="min-w-[320px] w-[320px]">
                    {isCreatingColumn ? (
                      <form onSubmit={handleAddColumn} className="bg-slate-800 p-3 rounded-2xl border border-blue-500">
                        <input autoFocus type="text" value={newColumnName} onChange={(e) => setNewColumnName(e.target.value)} placeholder="Nombre de lista..." className="w-full bg-slate-900 border border-slate-600 rounded-lg p-2 mb-2 text-white outline-none focus:border-blue-500 text-sm" />
                        <div className="flex gap-2">
                          <button type="submit" className="flex-1 bg-blue-600 text-white font-bold py-1.5 rounded text-sm hover:bg-blue-500">Añadir</button>
                          <button type="button" onClick={() => setIsCreatingColumn(false)} className="flex-1 bg-slate-700 text-slate-300 font-bold py-1.5 rounded text-sm hover:bg-slate-600">Cancelar</button>
                        </div>
                      </form>
                    ) : (
                      <button onClick={() => setIsCreatingColumn(true)} className="w-full bg-slate-800/50 hover:bg-slate-800 text-slate-400 hover:text-white border border-dashed border-slate-600 rounded-2xl p-4 font-bold transition-all text-left">
                        + Añadir lista
                      </button>
                    )}
                  </div>
                </DragDropContext>
              )}
            </div>
          )}
        </main>
      )}

      {/* =========================================
          MODAL ESTILO TRELLO
          ========================================= */}
      {modalCard && (
        <div className="fixed inset-0 bg-black/70 backdrop-blur-sm z-50 flex items-center justify-center p-4 overflow-y-auto" onClick={closeAndSaveModal}>
          <div className="bg-slate-800 w-full max-w-2xl rounded-2xl border border-slate-700 shadow-2xl overflow-hidden my-auto" onClick={e => e.stopPropagation()}>
            {/* Header Modal - Color */}
            <div className={`${modalCard.color} h-20 w-full relative`}>
              <button onClick={closeAndSaveModal} className="absolute top-4 right-4 w-8 h-8 bg-black/40 hover:bg-black/60 rounded-full flex items-center justify-center text-white font-bold transition-colors">✕</button>
            </div>
            
            <div className="p-6 sm:p-8 space-y-6">
              {/* Título y estado */}
              <div className="flex items-start gap-4">
                <button onClick={(e) => toggleCardCompletion(e, modalCard.id, modalCard.is_completed)} className={`mt-2 w-6 h-6 rounded-md border-2 flex-shrink-0 flex items-center justify-center transition-colors ${modalCard.is_completed ? 'bg-emerald-500 border-emerald-500' : 'bg-slate-900 border-slate-500 hover:border-emerald-500'}`}>
                  {modalCard.is_completed && <span className="text-white text-sm leading-none font-bold">✔</span>}
                </button>
                <input type="text" value={modalCard.title} onChange={(e) => setModalCard({ ...modalCard, title: e.target.value })} className={`w-full bg-transparent text-2xl font-bold text-white outline-none border-b border-transparent focus:border-blue-500 pb-1 ${modalCard.is_completed ? 'line-through text-slate-400' : ''}`} placeholder="Título de la tarjeta" />
              </div>

              {/* Selector de Color */}
              <div>
                <h4 className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-2">Color de Portada</h4>
                <div className="flex flex-wrap gap-2">
                  {CARD_COLORS.map(color => (
                    <button key={color} onClick={() => setModalCard({ ...modalCard, color })} className={`w-10 h-8 rounded-md ${color} ${modalCard.color === color ? 'ring-2 ring-white ring-offset-2 ring-offset-slate-800' : 'hover:opacity-80'}`} />
                  ))}
                </div>
              </div>

              {/* Descripción */}
              <div>
                <h4 className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-2">Descripción</h4>
                <textarea rows="6" value={modalCard.content || ''} onChange={(e) => setModalCard({ ...modalCard, content: e.target.value })} placeholder="Añade una descripción más detallada..." className="w-full bg-slate-900 border border-slate-600 rounded-lg p-3 text-white placeholder-slate-500 outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 transition-all resize-none" />
              </div>

              {/* Acciones de Peligro */}
              <div className="pt-4 border-t border-slate-700 flex justify-end gap-3">
                <button onClick={(e) => { toggleTrashCard(e, modalCard.id, true); setModalCard(null) }} className="px-4 py-2 bg-red-500/10 text-red-400 hover:bg-red-500/20 rounded-lg font-bold text-sm transition-colors">
                  Mover a papelera
                </button>
                <button onClick={closeAndSaveModal} className="px-6 py-2 bg-blue-600 hover:bg-blue-500 text-white rounded-lg font-bold transition-colors shadow-lg shadow-blue-900/50">
                  Guardar
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}