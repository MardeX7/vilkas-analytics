/**
 * EmmaChatFullscreen - Fullscreen AI chat experience
 *
 * Paras käytettävyys:
 * - Koko näytön modaali (ei hyppimistä)
 * - Viestit vievät kaiken tilan
 * - Input aina näkyvissä alhaalla (sticky)
 * - Kompaktit quick prompts
 * - Smooth animations
 */

import { useState, useRef, useEffect } from 'react'
import {
  MessageCircle,
  Send,
  Bot,
  User,
  Loader2,
  X,
  Trash2,
  Sparkles,
  ChevronUp,
  ChevronDown,
  Eye,
  TrendingUp,
  Target,
  Users,
  Package,
  Search,
  Lightbulb,
  HelpCircle,
  Bookmark,
  BookmarkCheck,
  History,
  ChevronLeft,
  FileText
} from 'lucide-react'
import { useTranslation } from '@/lib/i18n'
import { useEmmaChat } from '@/hooks/useEmmaChat'
import { supabase } from '@/lib/supabase'
import { useCurrentShop } from '@/config/storeConfig'

/**
 * Compact quick prompts for header - horizontal scroll
 */
const QUICK_PROMPTS = {
  fi: [
    { id: 'overview', text: 'Mikä vaikutti eniten viime viikolla?', icon: '📊' },
    { id: 'action', text: 'Mitä minun pitäisi tehdä seuraavaksi?', icon: '💡' },
    { id: 'growth', text: 'Mistä myynnin muutos johtui?', icon: '📈' },
    { id: 'risk', text: 'Missä olemme haavoittuvia?', icon: '⚠️' }
  ],
  sv: [
    { id: 'overview', text: 'Vad påverkade mest förra veckan?', icon: '📊' },
    { id: 'action', text: 'Vad ska jag göra härnäst?', icon: '💡' },
    { id: 'growth', text: 'Vad berodde försäljningsförändringen på?', icon: '📈' },
    { id: 'risk', text: 'Var är vi sårbara?', icon: '⚠️' }
  ]
}

/**
 * Categorized prompts for drop-up menu
 */
const CATEGORIES = {
  tilannekuva: {
    icon: Eye,
    labelFi: 'Tilannekuva',
    labelSv: 'Lägesbild',
    color: 'violet',
    questions: {
      fi: [
        'Mikä vaikutti eniten kokonaisindeksiin viime viikolla?',
        'Mitkä kolme mittaria selittävät tämän viikon muutoksen?',
        'Onko tämä viikko linjassa sesongin kanssa vai poikkeama?',
        'Missä osa-alueessa olemme heikoimmillamme?'
      ],
      sv: [
        'Vad påverkade mest det övergripande indexet förra veckan?',
        'Vilka tre mätvärden förklarar veckans förändring?',
        'Är denna vecka i linje med säsongen eller ett undantag?',
        'Inom vilket område är vi svagast?'
      ]
    }
  },
  kasvu: {
    icon: TrendingUp,
    labelFi: 'Kasvu & myynti',
    labelSv: 'Tillväxt',
    color: 'emerald',
    questions: {
      fi: [
        'Mistä viime viikon myynnin muutos oikeasti johtui?',
        'Mitkä tuotteet tai kategoriat vetävät kasvua?',
        'Kasvaako myynti laadukkaasti vai hinnan kautta?',
        'Mikä rajoittaa myynnin kasvua juuri nyt?'
      ],
      sv: [
        'Vad berodde förra veckans försäljningsförändring på?',
        'Vilka produkter eller kategorier driver tillväxten?',
        'Växer försäljningen kvalitativt eller genom prissänkningar?',
        'Vad begränsar försäljningstillväxten just nu?'
      ]
    }
  },
  tavoitteet: {
    icon: Target,
    labelFi: 'Tavoitteet',
    labelSv: 'Mål',
    color: 'blue',
    questions: {
      fi: [
        'Olemmeko matkalla kohti vuositavoitetta?',
        'Mikä uhkaa tavoitteen saavuttamista eniten?',
        'Paljonko myynnin pitäisi kasvaa viikkotasolla?',
        'Onko nykyinen tavoite realistinen?'
      ],
      sv: [
        'Är vi på väg mot årsmålet?',
        'Vad hotar måluppfyllelsen mest?',
        'Hur mycket bör försäljningen öka per vecka?',
        'Är det nuvarande målet realistiskt?'
      ]
    }
  },
  asiakkaat: {
    icon: Users,
    labelFi: 'Asiakkaat',
    labelSv: 'Kunder',
    color: 'pink',
    questions: {
      fi: [
        'Miten palaavien asiakkaiden osuus kehittyi?',
        'Ostavatko asiakkaat enemmän vai useammin?',
        'Miksi asiakas ei palaa toista kertaa?',
        'Mitkä tuotteet toimivat sisäänheittotuotteina?'
      ],
      sv: [
        'Hur utvecklades andelen återkommande kunder?',
        'Köper kunderna mer eller oftare?',
        'Varför kommer kunden inte tillbaka?',
        'Vilka produkter fungerar som ingångsprodukter?'
      ]
    }
  },
  varasto: {
    icon: Package,
    labelFi: 'Tuotteet',
    labelSv: 'Produkter',
    color: 'amber',
    questions: {
      fi: [
        'Mitkä A-tuotteet ovat suurin riski kuukauden aikana?',
        'Missä tuotteissa kysyntä ja varasto ovat epätasapainossa?',
        'Mihin tuotteisiin täydennykset pitäisi priorisoida?',
        'Mitkä tuotteet heikentävät katetta eniten?'
      ],
      sv: [
        'Vilka A-produkter är störst risk under månaden?',
        'Vilka produkter har obalans mellan efterfrågan och lager?',
        'Vilka produkter bör prioriteras för påfyllning?',
        'Vilka produkter försämrar marginalen mest?'
      ]
    }
  },
  seo: {
    icon: Search,
    labelFi: 'Näkyvyys',
    labelSv: 'Synlighet',
    color: 'cyan',
    questions: {
      fi: [
        'Onko SEO-näkyvyydessä muutoksia joilla on myyntivaikutus?',
        'Mitkä sivut menettivät näkyvyyttä viime viikolla?',
        'Kasvaako orgaaninen näkyvyys oikeissa kategorioissa?',
        'Missä näkyvyyden kasvu ei vielä näy myynnissä?'
      ],
      sv: [
        'Finns det SEO-förändringar som påverkar försäljningen?',
        'Vilka sidor tappade synlighet förra veckan?',
        'Växer organisk synlighet i rätt kategorier?',
        'Var syns inte synlighetstillväxten i försäljningen ännu?'
      ]
    }
  },
  toimenpiteet: {
    icon: Lightbulb,
    labelFi: 'Toimenpiteet',
    labelSv: 'Åtgärder',
    color: 'orange',
    questions: {
      fi: [
        'Mitkä 3 asiaa minun kannattaa tehdä seuraavaksi?',
        'Mikä toimenpide tuottaisi suurimman vaikutuksen?',
        'Mitä kannattaisi lopettaa tai vähentää?',
        'Jos aikaa on vain yhteen asiaan, mikä se on?'
      ],
      sv: [
        'Vilka 3 saker bör jag göra härnäst?',
        'Vilken åtgärd skulle ge störst effekt?',
        'Vad bör vi sluta med eller minska?',
        'Om det bara finns tid för en sak, vad är det?'
      ]
    }
  },
  selittavat: {
    icon: HelpCircle,
    labelFi: 'Selitä',
    labelSv: 'Förklara',
    color: 'slate',
    questions: {
      fi: [
        'Selitä yksinkertaisesti miksi kokonaisindeksi muuttui.',
        'Miten tämä mittari vaikuttaa kokonaisuuteen?',
        'Miksi tämä kehitys on ongelma – tai miksi ei?',
        'Mitä tästä pitäisi oppia seuraavaa sesonkia varten?'
      ],
      sv: [
        'Förklara enkelt varför det övergripande indexet förändrades.',
        'Hur påverkar detta mätvärde helheten?',
        'Varför är denna utveckling ett problem – eller varför inte?',
        'Vad bör vi lära oss inför nästa säsong?'
      ]
    }
  }
}

const CATEGORY_COLORS = {
  violet: 'bg-violet-500/10 text-violet-600 border-violet-500/20 hover:bg-violet-500/20',
  emerald: 'bg-emerald-500/10 text-emerald-600 border-emerald-500/20 hover:bg-emerald-500/20',
  blue: 'bg-blue-500/10 text-blue-600 border-blue-500/20 hover:bg-blue-500/20',
  pink: 'bg-pink-500/10 text-pink-600 border-pink-500/20 hover:bg-pink-500/20',
  amber: 'bg-amber-500/10 text-amber-600 border-amber-500/20 hover:bg-amber-500/20',
  cyan: 'bg-cyan-500/10 text-cyan-600 border-cyan-500/20 hover:bg-cyan-500/20',
  orange: 'bg-orange-500/10 text-orange-600 border-orange-500/20 hover:bg-orange-500/20',
  slate: 'bg-slate-500/10 text-slate-600 border-slate-500/20 hover:bg-slate-500/20'
}

/**
 * Quick Prompts Drop-Up Menu
 */
function QuickPromptsDropUp({ onSelect, disabled, language }) {
  const [menuOpen, setMenuOpen] = useState(false)
  const [activeCategory, setActiveCategory] = useState(null)
  const menuRef = useRef(null)
  const isFi = language === 'fi'

  // Close on click outside
  useEffect(() => {
    const handleClickOutside = (e) => {
      if (menuRef.current && !menuRef.current.contains(e.target)) {
        setMenuOpen(false)
        setActiveCategory(null)
      }
    }
    if (menuOpen) {
      document.addEventListener('mousedown', handleClickOutside)
    }
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [menuOpen])

  const handleSelectQuestion = (text) => {
    setMenuOpen(false)
    setActiveCategory(null)
    // Small delay to ensure menu closes before sending
    setTimeout(() => {
      onSelect(text)
    }, 50)
  }

  return (
    <div className="relative" ref={menuRef}>
      {/* Trigger button */}
      <button
        type="button"
        onClick={() => setMenuOpen(!menuOpen)}
        disabled={disabled}
        className={`flex items-center gap-2 px-3 py-3 rounded-xl border transition-all ${
          menuOpen
            ? 'bg-violet-500/20 border-violet-500/40 text-violet-600'
            : 'bg-background-subtle border-card-border text-muted-foreground hover:text-foreground hover:border-violet-500/30'
        } disabled:opacity-50 disabled:cursor-not-allowed`}
        title={isFi ? 'Valmiit kysymykset' : 'Färdiga frågor'}
      >
        <Sparkles className="h-4 w-4" />
        <span className="text-sm font-medium hidden sm:inline">
          {isFi ? 'Esimerkkikysymyksiä' : 'Exempelfrågor'}
        </span>
        <ChevronUp className={`h-4 w-4 transition-transform ${menuOpen ? 'rotate-180' : ''}`} />
      </button>

      {/* Drop-up menu */}
      {menuOpen && (
        <div className="absolute bottom-full left-0 mb-2 w-80 sm:w-96 bg-background-elevated border border-card-border rounded-xl shadow-2xl overflow-hidden animate-in fade-in slide-in-from-bottom-2 duration-200 z-50">
          {/* Categories */}
          {!activeCategory ? (
            <div className="p-2">
              <p className="text-[10px] uppercase tracking-wider text-muted-foreground px-2 py-1.5 font-medium">
                {isFi ? 'Valitse kategoria' : 'Välj kategori'}
              </p>
              <div className="grid grid-cols-2 gap-1.5 mt-1">
                {Object.entries(CATEGORIES).map(([key, cat]) => {
                  const Icon = cat.icon
                  return (
                    <button
                      key={key}
                      onClick={() => setActiveCategory(key)}
                      className={`flex items-center gap-2 px-3 py-2.5 text-sm font-medium rounded-lg border transition-all ${CATEGORY_COLORS[cat.color]}`}
                    >
                      <Icon className="h-4 w-4 flex-shrink-0" />
                      <span>{isFi ? cat.labelFi : cat.labelSv}</span>
                    </button>
                  )
                })}
              </div>
            </div>
          ) : (
            <div>
              {/* Back button + category header */}
              <div className="flex items-center gap-2 px-3 py-2.5 border-b border-card-border/50">
                <button
                  onClick={() => setActiveCategory(null)}
                  className="p-1 hover:bg-background-subtle rounded transition-colors"
                >
                  <ChevronUp className="h-4 w-4 rotate-[-90deg] text-muted-foreground" />
                </button>
                <span className="text-sm font-medium text-foreground">
                  {isFi ? CATEGORIES[activeCategory].labelFi : CATEGORIES[activeCategory].labelSv}
                </span>
              </div>

              {/* Questions */}
              <div className="p-2 max-h-64 overflow-y-auto">
                {CATEGORIES[activeCategory].questions[language]?.map((q, i) => (
                  <button
                    key={i}
                    onClick={() => handleSelectQuestion(q)}
                    className="w-full text-left px-3 py-2.5 text-sm text-foreground hover:bg-background-subtle rounded-lg transition-colors"
                  >
                    {q}
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

/**
 * Main fullscreen chat component
 */
export function EmmaChatFullscreen({ isOpen, onClose, dateRange, growthEngineData, initialMessage = '' }) {
  const { shopId } = useCurrentShop()
  const { t, language } = useTranslation()
  const isFi = language === 'fi'

  const [inputValue, setInputValue] = useState('')
  const [pendingMessage, setPendingMessage] = useState('')
  const [showScrollButton, setShowScrollButton] = useState(false)
  const messagesEndRef = useRef(null)
  const messagesContainerRef = useRef(null)
  const inputRef = useRef(null)

  // Save conversation state
  const [showSaveModal, setShowSaveModal] = useState(false)
  const [showSavedList, setShowSavedList] = useState(false)
  const [isSaved, setIsSaved] = useState(false)
  const [saveTitle, setSaveTitle] = useState('')
  const [saveNote, setSaveNote] = useState('')
  const [savedConversations, setSavedConversations] = useState([])
  const [loadingSaved, setLoadingSaved] = useState(false)

  const {
    messages,
    loading,
    error,
    isTyping,
    sendMessage,
    clearChat,
    sessionId,
    loadSession
  } = useEmmaChat({ dateRange, language })

  // Load saved conversations
  const loadSavedConversations = async () => {
    setLoadingSaved(true)
    try {
      const { data, error } = await supabase.rpc('get_saved_conversations', {
        p_store_id: shopId,
        p_limit: 20
      })
      if (!error && data) {
        setSavedConversations(data)
      }
    } catch (err) {
      console.error('Failed to load saved conversations:', err)
    } finally {
      setLoadingSaved(false)
    }
  }

  // Load saved conversations when list is opened
  useEffect(() => {
    if (showSavedList) {
      loadSavedConversations()
    }
  }, [showSavedList])

  // Save conversation handler
  const handleSaveConversation = async () => {
    if (!sessionId || !saveTitle.trim()) return

    try {
      const { data, error } = await supabase.rpc('save_chat_session', {
        p_session_id: sessionId,
        p_title: saveTitle.trim(),
        p_user_note: saveNote.trim() || null
      })

      if (!error) {
        setIsSaved(true)
        setShowSaveModal(false)
        setSaveTitle('')
        setSaveNote('')
      }
    } catch (err) {
      console.error('Failed to save conversation:', err)
    }
  }

  // Load a saved conversation
  const handleLoadConversation = async (conversationId) => {
    if (loadSession) {
      await loadSession(conversationId)
    }
    setShowSavedList(false)
  }

  // Reset saved state when clearing chat
  const handleClearChat = () => {
    clearChat()
    setIsSaved(false)
  }

  const prompts = QUICK_PROMPTS[language] || QUICK_PROMPTS.fi

  // Focus input when opened
  useEffect(() => {
    if (isOpen && inputRef.current) {
      setTimeout(() => inputRef.current?.focus(), 100)
    }
  }, [isOpen])

  // Handle initialMessage - set as pending and send when chat opens
  useEffect(() => {
    if (isOpen && initialMessage && initialMessage.trim()) {
      // Set input value so user can see/edit before sending
      setInputValue(initialMessage)
      setPendingMessage(initialMessage)
    }
  }, [isOpen, initialMessage])

  // Auto-send pending message after short delay (gives user chance to see it)
  useEffect(() => {
    if (pendingMessage && isOpen && !isTyping && messages.length === 0) {
      const timer = setTimeout(() => {
        if (pendingMessage === inputValue) {
          sendMessage(pendingMessage)
          setInputValue('')
          setPendingMessage('')
        }
      }, 500) // Small delay so user sees the question
      return () => clearTimeout(timer)
    }
  }, [pendingMessage, isOpen, isTyping, messages.length, inputValue, sendMessage])

  // Scroll to bottom on new messages
  useEffect(() => {
    if (messagesEndRef.current) {
      messagesEndRef.current.scrollIntoView({ behavior: 'smooth' })
    }
  }, [messages, isTyping])

  // Track scroll position for "scroll to bottom" button
  useEffect(() => {
    const container = messagesContainerRef.current
    if (!container) return

    const handleScroll = () => {
      const { scrollTop, scrollHeight, clientHeight } = container
      const isNearBottom = scrollHeight - scrollTop - clientHeight < 100
      setShowScrollButton(!isNearBottom && messages.length > 2)
    }

    container.addEventListener('scroll', handleScroll)
    return () => container.removeEventListener('scroll', handleScroll)
  }, [messages.length])

  // Handle escape key
  useEffect(() => {
    const handleEscape = (e) => {
      if (e.key === 'Escape' && isOpen) {
        onClose()
      }
    }
    window.addEventListener('keydown', handleEscape)
    return () => window.removeEventListener('keydown', handleEscape)
  }, [isOpen, onClose])

  const handleSubmit = async (e) => {
    e.preventDefault()
    if (!inputValue.trim() || isTyping) return

    const question = inputValue.trim()
    setInputValue('')
    await sendMessage(question)
  }

  const handleQuickPrompt = async (text) => {
    if (isTyping) return
    await sendMessage(text)
  }

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }

  if (!isOpen) return null

  return (
    <div className="fixed inset-0 z-50 bg-background flex flex-col animate-in fade-in duration-200">
      {/* Header */}
      <header className="flex-shrink-0 border-b border-border bg-background-elevated/80 backdrop-blur-md">
        <div className="flex items-center justify-between px-4 py-3 max-w-4xl mx-auto w-full">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-gradient-to-br from-violet-500/20 to-violet-600/20 rounded-xl">
              <MessageCircle className="h-5 w-5 text-violet-500" />
            </div>
            <div>
              <h1 className="font-semibold text-foreground flex items-center gap-2">
                Emma
                <Sparkles className="h-3.5 w-3.5 text-violet-400" />
              </h1>
              <p className="text-xs text-muted-foreground">
                {isFi ? 'Henkilökohtainen analyytikkosi' : 'Din personliga analytiker'}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            {/* Saved conversations button */}
            <button
              onClick={() => setShowSavedList(true)}
              className="p-2 text-muted-foreground hover:text-foreground hover:bg-background-subtle rounded-lg transition-colors"
              title={isFi ? 'Tallennetut keskustelut' : 'Sparade konversationer'}
            >
              <History className="h-4 w-4" />
            </button>

            {/* Save conversation button */}
            {messages.length > 0 && (
              <button
                onClick={() => setShowSaveModal(true)}
                className={`p-2 rounded-lg transition-colors ${
                  isSaved
                    ? 'text-amber-500 bg-amber-500/10'
                    : 'text-muted-foreground hover:text-foreground hover:bg-background-subtle'
                }`}
                title={isFi ? (isSaved ? 'Keskustelu tallennettu' : 'Tallenna keskustelu') : (isSaved ? 'Konversation sparad' : 'Spara konversation')}
              >
                {isSaved ? <BookmarkCheck className="h-4 w-4" /> : <Bookmark className="h-4 w-4" />}
              </button>
            )}

            {messages.length > 0 && (
              <button
                onClick={handleClearChat}
                className="p-2 text-muted-foreground hover:text-foreground hover:bg-background-subtle rounded-lg transition-colors"
                title={isFi ? 'Uusi keskustelu' : 'Ny konversation'}
              >
                <Trash2 className="h-4 w-4" />
              </button>
            )}
            <button
              onClick={onClose}
              className="p-2 text-muted-foreground hover:text-foreground hover:bg-background-subtle rounded-lg transition-colors"
              title={isFi ? 'Sulje' : 'Stäng'}
            >
              <X className="h-5 w-5" />
            </button>
          </div>
        </div>

        {/* Quick prompts - horizontal scroll */}
        <div className="px-4 pb-3 max-w-4xl mx-auto w-full">
          <div className="flex gap-2 overflow-x-auto pb-1 scrollbar-hide">
            {prompts.map((prompt) => (
              <button
                key={prompt.id}
                onClick={() => handleQuickPrompt(prompt.text)}
                disabled={isTyping}
                className="flex-shrink-0 inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium
                         bg-background-subtle hover:bg-violet-500/10 border border-card-border hover:border-violet-500/30
                         text-foreground-muted hover:text-violet-600 rounded-full transition-all
                         disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <span>{prompt.icon}</span>
                <span className="whitespace-nowrap">{prompt.text}</span>
              </button>
            ))}
          </div>
        </div>
      </header>

      {/* Messages area - takes all available space */}
      <div
        ref={messagesContainerRef}
        className="flex-1 overflow-y-auto"
      >
        <div className="max-w-4xl mx-auto px-4 py-6 space-y-4">
          {messages.length === 0 && !isTyping ? (
            <div className="h-[50vh] flex flex-col items-center justify-center text-center">
              <div className="p-5 bg-gradient-to-br from-violet-500/10 to-violet-600/10 rounded-3xl mb-5">
                <Bot className="h-12 w-12 text-violet-500/60" />
              </div>
              <h2 className="text-lg font-semibold text-foreground mb-2">
                {isFi ? 'Hei! Olen Emma.' : 'Hej! Jag är Emma.'}
              </h2>
              <p className="text-sm text-muted-foreground max-w-sm">
                {isFi
                  ? 'Analysoin verkkokauppasi dataa ja autan sinua tekemään parempia päätöksiä. Kysy mitä vain!'
                  : 'Jag analyserar din webbutiks data och hjälper dig att fatta bättre beslut. Fråga vad som helst!'}
              </p>
            </div>
          ) : (
            <>
              {messages.map((message, index) => (
                <ChatMessage
                  key={index}
                  message={message}
                  isEmma={message.role === 'assistant'}
                />
              ))}

              {isTyping && (
                <div className="flex items-start gap-3">
                  <div className="p-2.5 bg-gradient-to-br from-violet-500/20 to-violet-600/20 rounded-xl flex-shrink-0">
                    <Bot className="h-5 w-5 text-violet-500" />
                  </div>
                  <div className="flex items-center gap-2 px-4 py-3 bg-background-elevated border border-card-border/50 rounded-2xl rounded-tl-sm">
                    <Loader2 className="h-4 w-4 animate-spin text-violet-500" />
                    <span className="text-sm text-muted-foreground">
                      {isFi ? 'Emma analysoi...' : 'Emma analyserar...'}
                    </span>
                  </div>
                </div>
              )}

              <div ref={messagesEndRef} className="h-4" />
            </>
          )}
        </div>
      </div>

      {/* Scroll to bottom button */}
      {showScrollButton && (
        <button
          onClick={scrollToBottom}
          className="absolute bottom-24 left-1/2 -translate-x-1/2 p-2 bg-background-elevated border border-card-border
                   rounded-full shadow-lg hover:bg-background-subtle transition-all animate-in fade-in slide-in-from-bottom-2"
        >
          <ChevronDown className="h-5 w-5 text-muted-foreground" />
        </button>
      )}

      {/* Input area - sticky at bottom */}
      <div className="flex-shrink-0 border-t border-border bg-background-elevated/80 backdrop-blur-md">
        <form onSubmit={handleSubmit} className="max-w-4xl mx-auto px-4 py-4">
          <div className="flex items-center gap-2">
            {/* Quick prompts drop-up */}
            <QuickPromptsDropUp
              onSelect={handleQuickPrompt}
              disabled={isTyping}
              language={language}
            />

            {/* Input field */}
            <input
              ref={inputRef}
              type="text"
              value={inputValue}
              onChange={(e) => setInputValue(e.target.value)}
              placeholder={isFi ? 'Kysy Emmalta...' : 'Fråga Emma...'}
              disabled={isTyping}
              className="flex-1 px-4 py-3 text-base bg-background border border-card-border rounded-xl
                       focus:outline-none focus:ring-2 focus:ring-violet-500/50 focus:border-violet-500
                       disabled:opacity-50 placeholder:text-muted-foreground/50"
            />

            {/* Send button */}
            <button
              type="submit"
              disabled={!inputValue.trim() || isTyping}
              className="p-3.5 bg-gradient-to-r from-violet-500 to-violet-600 hover:from-violet-600 hover:to-violet-700
                       text-white rounded-xl shadow-lg shadow-violet-500/25
                       transition-all disabled:opacity-50 disabled:cursor-not-allowed disabled:shadow-none
                       active:scale-95"
            >
              <Send className="h-5 w-5" />
            </button>
          </div>

          {error && (
            <p className="mt-2 text-xs text-destructive bg-destructive/10 px-3 py-2 rounded-lg">
              {error}
            </p>
          )}
        </form>
      </div>

      {/* Save Conversation Modal */}
      {showSaveModal && (
        <div className="fixed inset-0 z-[60] bg-black/50 flex items-center justify-center p-4 animate-in fade-in">
          <div className="bg-background-elevated border border-card-border rounded-2xl w-full max-w-md shadow-2xl animate-in zoom-in-95">
            <div className="px-5 py-4 border-b border-border/50 flex items-center justify-between">
              <h3 className="font-semibold text-foreground flex items-center gap-2">
                <Bookmark className="h-5 w-5 text-amber-500" />
                {isFi ? 'Tallenna keskustelu' : 'Spara konversation'}
              </h3>
              <button
                onClick={() => setShowSaveModal(false)}
                className="p-1.5 text-muted-foreground hover:text-foreground hover:bg-background-subtle rounded-lg transition-colors"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
            <div className="p-5 space-y-4">
              <div>
                <label className="block text-sm font-medium text-foreground mb-1.5">
                  {isFi ? 'Nimi *' : 'Namn *'}
                </label>
                <input
                  type="text"
                  value={saveTitle}
                  onChange={(e) => setSaveTitle(e.target.value)}
                  placeholder={isFi ? 'Esim. Varastoanalyysi tammikuu' : 'T.ex. Lageranalys januari'}
                  className="w-full px-3 py-2.5 text-sm bg-background border border-card-border rounded-lg
                           focus:outline-none focus:ring-2 focus:ring-violet-500/50 focus:border-violet-500
                           placeholder:text-muted-foreground/50"
                  autoFocus
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-foreground mb-1.5">
                  {isFi ? 'Muistiinpano (valinnainen)' : 'Anteckning (valfri)'}
                </label>
                <textarea
                  value={saveNote}
                  onChange={(e) => setSaveNote(e.target.value)}
                  placeholder={isFi ? 'Omat muistiinpanot keskustelusta...' : 'Egna anteckningar om konversationen...'}
                  rows={3}
                  className="w-full px-3 py-2.5 text-sm bg-background border border-card-border rounded-lg
                           focus:outline-none focus:ring-2 focus:ring-violet-500/50 focus:border-violet-500
                           placeholder:text-muted-foreground/50 resize-none"
                />
              </div>
            </div>
            <div className="px-5 py-4 border-t border-border/50 flex justify-end gap-2">
              <button
                onClick={() => setShowSaveModal(false)}
                className="px-4 py-2 text-sm font-medium text-muted-foreground hover:text-foreground
                         hover:bg-background-subtle rounded-lg transition-colors"
              >
                {isFi ? 'Peruuta' : 'Avbryt'}
              </button>
              <button
                onClick={handleSaveConversation}
                disabled={!saveTitle.trim()}
                className="px-4 py-2 text-sm font-medium bg-gradient-to-r from-violet-500 to-violet-600
                         hover:from-violet-600 hover:to-violet-700 text-white rounded-lg
                         disabled:opacity-50 disabled:cursor-not-allowed transition-all"
              >
                {isFi ? 'Tallenna' : 'Spara'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Saved Conversations List */}
      {showSavedList && (
        <div className="fixed inset-0 z-[60] bg-background flex flex-col animate-in slide-in-from-right">
          <header className="flex-shrink-0 border-b border-border bg-background-elevated/80 backdrop-blur-md">
            <div className="flex items-center gap-3 px-4 py-3 max-w-4xl mx-auto w-full">
              <button
                onClick={() => setShowSavedList(false)}
                className="p-2 text-muted-foreground hover:text-foreground hover:bg-background-subtle rounded-lg transition-colors"
              >
                <ChevronLeft className="h-5 w-5" />
              </button>
              <div className="flex items-center gap-2">
                <History className="h-5 w-5 text-violet-500" />
                <h2 className="font-semibold text-foreground">
                  {isFi ? 'Tallennetut keskustelut' : 'Sparade konversationer'}
                </h2>
              </div>
            </div>
          </header>

          <div className="flex-1 overflow-y-auto">
            <div className="max-w-4xl mx-auto px-4 py-6">
              {loadingSaved ? (
                <div className="flex items-center justify-center py-12">
                  <Loader2 className="h-6 w-6 animate-spin text-violet-500" />
                </div>
              ) : savedConversations.length === 0 ? (
                <div className="text-center py-12">
                  <div className="p-4 bg-background-subtle rounded-full inline-block mb-4">
                    <Bookmark className="h-8 w-8 text-muted-foreground/50" />
                  </div>
                  <p className="text-muted-foreground">
                    {isFi ? 'Ei tallennettuja keskusteluja' : 'Inga sparade konversationer'}
                  </p>
                  <p className="text-sm text-muted-foreground/70 mt-1">
                    {isFi
                      ? 'Tallenna keskustelu kirjanmerkki-napista'
                      : 'Spara en konversation med bokmärkesknappen'}
                  </p>
                </div>
              ) : (
                <div className="space-y-3">
                  {savedConversations.map((conv) => (
                    <button
                      key={conv.id}
                      onClick={() => handleLoadConversation(conv.id)}
                      className="w-full text-left p-4 bg-background-elevated border border-card-border rounded-xl
                               hover:border-violet-500/30 hover:bg-violet-500/5 transition-all group"
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div className="flex-1 min-w-0">
                          <h3 className="font-medium text-foreground group-hover:text-violet-600 transition-colors truncate">
                            {conv.title}
                          </h3>
                          {conv.user_note && (
                            <p className="text-sm text-muted-foreground mt-1 line-clamp-2">
                              {conv.user_note}
                            </p>
                          )}
                          {conv.last_message && (
                            <p className="text-xs text-muted-foreground/70 mt-2 truncate flex items-center gap-1.5">
                              <FileText className="h-3 w-3 flex-shrink-0" />
                              {conv.last_message}
                            </p>
                          )}
                        </div>
                        <div className="flex-shrink-0 text-right">
                          <p className="text-xs text-muted-foreground">
                            {new Date(conv.saved_at).toLocaleDateString(isFi ? 'fi-FI' : 'sv-SE', {
                              day: 'numeric',
                              month: 'short'
                            })}
                          </p>
                          <p className="text-xs text-muted-foreground/70 mt-0.5">
                            {conv.message_count} {isFi ? 'viestiä' : 'meddelanden'}
                          </p>
                        </div>
                      </div>
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

/**
 * Individual chat message with better formatting
 */
function ChatMessage({ message, isEmma }) {
  return (
    <div className={`flex items-start gap-3 ${isEmma ? '' : 'flex-row-reverse'}`}>
      <div className={`p-2.5 rounded-xl flex-shrink-0 ${
        isEmma
          ? 'bg-gradient-to-br from-violet-500/20 to-violet-600/20'
          : 'bg-primary/10'
      }`}>
        {isEmma ? (
          <Bot className="h-5 w-5 text-violet-500" />
        ) : (
          <User className="h-5 w-5 text-primary" />
        )}
      </div>

      <div className={`max-w-[85%] ${isEmma ? '' : 'text-right'}`}>
        <div className={`inline-block px-4 py-3 rounded-2xl text-sm leading-relaxed ${
          isEmma
            ? 'bg-background-elevated border border-card-border/50 text-foreground rounded-tl-sm'
            : 'bg-gradient-to-r from-primary to-primary/90 text-primary-foreground rounded-tr-sm'
        }`}>
          <FormattedMessage content={message.content} />
        </div>
        <p className="text-[10px] text-muted-foreground mt-1.5 px-1">
          {new Date(message.created_at || Date.now()).toLocaleTimeString([], {
            hour: '2-digit',
            minute: '2-digit'
          })}
        </p>
      </div>
    </div>
  )
}

/**
 * Format message with markdown-like syntax
 */
function FormattedMessage({ content }) {
  const lines = content.split('\n')

  return (
    <div className="space-y-2">
      {lines.map((line, i) => {
        // Skip empty lines but preserve spacing
        if (!line.trim()) return <div key={i} className="h-2" />

        // Numbered lists
        const numberedMatch = line.match(/^(\d+)\.\s+(.*)/)
        if (numberedMatch) {
          const [, num, text] = numberedMatch
          return (
            <div key={i} className="flex gap-2">
              <span className="text-violet-500 font-semibold">{num}.</span>
              <span>{formatInlineText(text)}</span>
            </div>
          )
        }

        // Bullet points
        if (line.startsWith('- ') || line.startsWith('• ')) {
          return (
            <div key={i} className="flex gap-2">
              <span className="text-violet-500">•</span>
              <span>{formatInlineText(line.slice(2))}</span>
            </div>
          )
        }

        // Regular paragraph
        return <p key={i}>{formatInlineText(line)}</p>
      })}
    </div>
  )
}

/**
 * Format inline text (bold, etc)
 */
function formatInlineText(text) {
  const parts = text.split(/\*\*(.*?)\*\*/g)
  return parts.map((part, j) =>
    j % 2 === 1 ? (
      <strong key={j} className="font-semibold text-foreground">{part}</strong>
    ) : (
      part
    )
  )
}

export default EmmaChatFullscreen
