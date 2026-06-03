// @ts-nocheck
'use client'
import { useWhisper } from './useWhisper'

export function VoiceButton({ onResult, size = 32 }: { onResult: (text: string) => void, size?: number }) {
  const { listening, processing, toggle } = useWhisper(onResult)

  return (
    <button
      onClick={toggle}
      title={listening ? 'Остановить' : processing ? 'Обрабатываю...' : 'Голосовой ввод (Whisper)'}
      style={{
        width: size, height: size,
        borderRadius: 8,
        background: listening
          ? 'rgba(224,112,112,0.2)'
          : processing
          ? 'rgba(200,184,154,0.15)'
          : 'var(--surface2,#1a1a1e)',
        border: `1px solid ${
          listening ? 'rgba(224,112,112,0.4)'
          : processing ? 'rgba(200,184,154,0.3)'
          : 'rgba(255,255,255,0.07)'
        }`,
        cursor: processing ? 'wait' : 'pointer',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        flexShrink: 0,
        transition: 'all 0.2s',
        animation: listening ? 'voicePulse 1s ease-in-out infinite' : 'none',
      }}
    >
      {processing ? (
        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#c8b89a" strokeWidth="2">
          <circle cx="12" cy="12" r="10" strokeDasharray="30" strokeDashoffset="10">
            <animateTransform attributeName="transform" type="rotate" from="0 12 12" to="360 12 12" dur="1s" repeatCount="indefinite"/>
          </circle>
        </svg>
      ) : (
        <svg width="13" height="13" viewBox="0 0 24 24" fill={listening ? '#e07070' : '#666'}>
          <path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z"/>
          <path d="M19 10v2a7 7 0 0 1-14 0v-2" stroke={listening ? '#e07070' : '#666'} strokeWidth="2" fill="none"/>
          <line x1="12" y1="19" x2="12" y2="23" stroke={listening ? '#e07070' : '#666'} strokeWidth="2"/>
          <line x1="8" y1="23" x2="16" y2="23" stroke={listening ? '#e07070' : '#666'} strokeWidth="2"/>
        </svg>
      )}
    </button>
  )
}
