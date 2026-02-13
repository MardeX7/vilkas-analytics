/**
 * EmmaChat - AI-analyytikko keskustelukomponentti
 *
 * Emma on henkilökohtainen data-analyytikko joka:
 * - Selittää miksi jokin indeksi muuttui
 * - Vertailee kahta ajanjaksoa
 * - Vastaa "mitä jos" -kysymyksiin
 * - Porautuu yksittäisiin mittareihin
 *
 * Ei chatbot - henkilökohtainen analyytikko.
 *
 * Versio 2.0: Tukee isFullSize-tilaa (aina auki oikessa sarakkeessa)
 */

import { useState, useRef, useEffect } from 'react'
import {
  MessageCircle,
  Send,
  User,
  Bot,
  Loader2,
  ChevronUp,
  ChevronDown,
  Sparkles,
  X,
  Trash2
} from 'lucide-react'
import { useTranslation } from '@/lib/i18n'
import { useEmmaChat } from '@/hooks/useEmmaChat'
import { QuickPrompts } from './QuickPrompts'

/**
 * Main EmmaChat Component
 */
export function EmmaChat({ dateRange, growthEngineData, isFullSize = false }) {
  const { t, language } = useTranslation()
  const [isExpanded, setIsExpanded] = useState(isFullSize)
  const [inputValue, setInputValue] = useState('')
  const messagesEndRef = useRef(null)
  const inputRef = useRef(null)

  const {
    messages,
    loading,
    error,
    isTyping,
    sendMessage,
    clearChat
  } = useEmmaChat({ dateRange, language })

  // Auto-expand if isFullSize
  useEffect(() => {
    if (isFullSize) {
      setIsExpanded(true)
    }
  }, [isFullSize])

  // Scroll to bottom when new messages arrive
  useEffect(() => {
    if (messagesEndRef.current && isExpanded) {
      messagesEndRef.current.scrollIntoView({ behavior: 'smooth' })
    }
  }, [messages, isExpanded])

  // Focus input when expanded
  useEffect(() => {
    if (isExpanded && inputRef.current) {
      inputRef.current.focus()
    }
  }, [isExpanded])

  const handleSubmit = async (e) => {
    e.preventDefault()
    if (!inputValue.trim() || isTyping) return

    const question = inputValue.trim()
    setInputValue('')
    await sendMessage(question)
  }

  const handleQuickPrompt = async (prompt) => {
    await sendMessage(prompt)
  }

  // Full-size mode: always visible, larger
  if (isFullSize) {
    return (
      <div className="bg-gradient-to-br from-background-elevated to-violet-500/5 border border-card-border rounded-xl overflow-hidden shadow-lg">
        {/* Header - Always visible */}
        <div className="p-4 border-b border-card-border/50 bg-gradient-to-r from-violet-500/10 to-primary/10">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="p-2.5 bg-gradient-to-br from-violet-500/20 to-violet-600/20 rounded-xl shadow-inner">
                <MessageCircle className="h-5 w-5 text-violet-500" />
              </div>
              <div>
                <h3 className="font-semibold text-foreground flex items-center gap-2">
                  Emma
                  <Sparkles className="h-3.5 w-3.5 text-violet-400" />
                </h3>
                <p className="text-xs text-muted-foreground">
                  {t('emma.subtitle')}
                </p>
              </div>
            </div>

            {messages.length > 0 && (
              <button
                onClick={clearChat}
                className="p-2 text-muted-foreground hover:text-foreground hover:bg-background-subtle rounded-lg transition-colors"
                title={t('emma.clearChat')}
              >
                <Trash2 className="h-4 w-4" />
              </button>
            )}
          </div>
        </div>

        {/* Quick prompts */}
        <QuickPrompts
          onSelect={handleQuickPrompt}
          disabled={isTyping}
          growthEngineData={growthEngineData}
        />

        {/* Messages area - taller for full-size */}
        <div className="h-[400px] overflow-y-auto p-4 space-y-4 bg-gradient-to-b from-background-subtle/20 to-transparent">
          {messages.length === 0 && !isTyping ? (
            <div className="h-full flex flex-col items-center justify-center text-center">
              <div className="p-4 bg-violet-500/10 rounded-2xl mb-4">
                <Sparkles className="h-10 w-10 text-violet-500/50" />
              </div>
              <p className="text-sm text-foreground font-medium mb-1">
                {t('emma.greeting')}
              </p>
              <p className="text-xs text-muted-foreground max-w-[200px]">
                {t('emma.quickPrompts')}
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
                  <div className="p-2 bg-gradient-to-br from-violet-500/20 to-violet-600/20 rounded-xl">
                    <Bot className="h-4 w-4 text-violet-500" />
                  </div>
                  <div className="flex items-center gap-2 px-4 py-3 bg-background-elevated border border-card-border/50 rounded-xl text-sm text-muted-foreground">
                    <Loader2 className="h-4 w-4 animate-spin text-violet-500" />
                    {t('emma.thinking')}
                  </div>
                </div>
              )}

              <div ref={messagesEndRef} />
            </>
          )}
        </div>

        {/* Input area */}
        <form onSubmit={handleSubmit} className="p-4 border-t border-card-border/50 bg-background-elevated/50">
          <div className="flex items-center gap-2">
            <input
              ref={inputRef}
              type="text"
              value={inputValue}
              onChange={(e) => setInputValue(e.target.value)}
              placeholder={t('emma.placeholder')}
              disabled={isTyping}
              className="flex-1 px-4 py-3 text-sm bg-background border border-card-border rounded-xl
                       focus:outline-none focus:ring-2 focus:ring-violet-500/50 focus:border-violet-500
                       disabled:opacity-50 placeholder:text-muted-foreground/50"
            />
            <button
              type="submit"
              disabled={!inputValue.trim() || isTyping}
              className="p-3 bg-gradient-to-r from-violet-500 to-violet-600 hover:from-violet-600 hover:to-violet-700
                       text-white rounded-xl shadow-lg shadow-violet-500/20
                       transition-all disabled:opacity-50 disabled:cursor-not-allowed disabled:shadow-none"
            >
              <Send className="h-4 w-4" />
            </button>
          </div>

          {/* Error message */}
          {error && (
            <p className="mt-2 text-xs text-destructive bg-destructive/10 px-3 py-2 rounded-lg">{error}</p>
          )}
        </form>
      </div>
    )
  }

  // Collapsible mode: original behavior
  return (
    <div className="bg-background-elevated border border-card-border rounded-lg overflow-hidden">
      {/* Header - always visible */}
      <button
        onClick={() => setIsExpanded(!isExpanded)}
        className="w-full p-4 flex items-center justify-between hover:bg-background-subtle/50 transition-colors"
      >
        <div className="flex items-center gap-3">
          <div className="p-2 bg-violet-500/10 rounded-lg">
            <MessageCircle className="h-5 w-5 text-violet-500" />
          </div>
          <div className="text-left">
            <h3 className="font-semibold text-foreground flex items-center gap-2">
              Emma
              <span className="text-xs font-normal text-muted-foreground">
                {t('emma.subtitle')}
              </span>
            </h3>
            {messages.length > 0 && !isExpanded && (
              <p className="text-xs text-muted-foreground truncate max-w-[300px]">
                {messages[messages.length - 1].content.substring(0, 50)}...
              </p>
            )}
          </div>
        </div>

        <div className="flex items-center gap-2">
          {messages.length > 0 && (
            <span className="px-2 py-0.5 text-xs bg-violet-500/10 text-violet-500 rounded-full">
              {messages.length} {t('emma.messages')}
            </span>
          )}
          {isExpanded ? (
            <ChevronUp className="h-5 w-5 text-muted-foreground" />
          ) : (
            <ChevronDown className="h-5 w-5 text-muted-foreground" />
          )}
        </div>
      </button>

      {/* Expanded content */}
      {isExpanded && (
        <div className="border-t border-card-border/50">
          {/* Quick prompts */}
          <QuickPrompts
            onSelect={handleQuickPrompt}
            disabled={isTyping}
            growthEngineData={growthEngineData}
          />

          {/* Messages area */}
          <div className="h-64 overflow-y-auto p-4 space-y-4 bg-background-subtle/30">
            {messages.length === 0 && !isTyping ? (
              <div className="h-full flex flex-col items-center justify-center text-center">
                <Sparkles className="h-8 w-8 text-violet-500/30 mb-3" />
                <p className="text-sm text-muted-foreground">
                  {t('emma.greeting')}
                </p>
                <p className="text-xs text-muted-foreground/70 mt-1">
                  {t('emma.quickPrompts')}
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
                    <div className="p-1.5 bg-violet-500/10 rounded-full">
                      <Bot className="h-4 w-4 text-violet-500" />
                    </div>
                    <div className="flex items-center gap-2 text-sm text-muted-foreground">
                      <Loader2 className="h-4 w-4 animate-spin" />
                      {t('emma.thinking')}
                    </div>
                  </div>
                )}

                <div ref={messagesEndRef} />
              </>
            )}
          </div>

          {/* Input area */}
          <form onSubmit={handleSubmit} className="p-4 border-t border-card-border/50">
            <div className="flex items-center gap-2">
              <input
                ref={inputRef}
                type="text"
                value={inputValue}
                onChange={(e) => setInputValue(e.target.value)}
                placeholder={t('emma.placeholder')}
                disabled={isTyping}
                className="flex-1 px-3 py-2 text-sm bg-background-subtle border border-card-border rounded-lg
                         focus:outline-none focus:ring-2 focus:ring-primary/50 focus:border-primary
                         disabled:opacity-50 placeholder:text-muted-foreground/50"
              />
              <button
                type="submit"
                disabled={!inputValue.trim() || isTyping}
                className="p-2 bg-violet-500 hover:bg-violet-600 text-white rounded-lg
                         transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <Send className="h-4 w-4" />
              </button>
            </div>

            {/* Error message */}
            {error && (
              <p className="mt-2 text-xs text-destructive">{error}</p>
            )}

            {/* Clear chat button */}
            {messages.length > 0 && (
              <button
                type="button"
                onClick={clearChat}
                className="mt-2 text-xs text-muted-foreground hover:text-foreground transition-colors"
              >
                {t('emma.clearChat')}
              </button>
            )}
          </form>
        </div>
      )}
    </div>
  )
}

/**
 * Individual chat message
 */
function ChatMessage({ message, isEmma }) {
  return (
    <div className={`flex items-start gap-3 ${isEmma ? '' : 'flex-row-reverse'}`}>
      <div className={`p-2 rounded-xl flex-shrink-0 ${
        isEmma
          ? 'bg-gradient-to-br from-violet-500/20 to-violet-600/20'
          : 'bg-primary/10'
      }`}>
        {isEmma ? (
          <Bot className="h-4 w-4 text-violet-500" />
        ) : (
          <User className="h-4 w-4 text-primary" />
        )}
      </div>

      <div className={`max-w-[85%] ${isEmma ? '' : 'text-right'}`}>
        <div className={`inline-block px-4 py-3 rounded-2xl text-sm ${
          isEmma
            ? 'bg-background-elevated border border-card-border/50 text-foreground rounded-tl-sm'
            : 'bg-gradient-to-r from-primary to-primary/90 text-primary-foreground rounded-tr-sm'
        }`}>
          {/* Parse simple markdown-like formatting */}
          <FormattedMessage content={message.content} />
        </div>
        <p className="text-xs text-muted-foreground mt-1.5 px-1">
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
 * Simple message formatting (bold, newlines)
 */
function FormattedMessage({ content }) {
  // Split by newlines and render
  const lines = content.split('\n')

  return (
    <div className="space-y-1.5">
      {lines.map((line, i) => {
        // Bold text between **
        const parts = line.split(/\*\*(.*?)\*\*/g)
        return (
          <p key={i}>
            {parts.map((part, j) =>
              j % 2 === 1 ? (
                <strong key={j} className="font-semibold">{part}</strong>
              ) : (
                part
              )
            )}
          </p>
        )
      })}
    </div>
  )
}

export default EmmaChat
