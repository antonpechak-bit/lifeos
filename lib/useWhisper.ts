// @ts-nocheck
import { useState, useRef, useCallback } from 'react'
 
export function useWhisper(onResult: (text: string) => void) {
  const [listening, setListening] = useState(false)
  const [processing, setProcessing] = useState(false)
  const mediaRecorderRef = useRef(null)
  const chunksRef = useRef([])
 
  const start = useCallback(async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      chunksRef.current = []
 
      const mediaRecorder = new MediaRecorder(stream, {
        mimeType: MediaRecorder.isTypeSupported('audio/webm') ? 'audio/webm' : 'audio/mp4'
      })
 
      mediaRecorder.ondataavailable = (e) => {
        if (e.data.size > 0) chunksRef.current.push(e.data)
      }
 
      mediaRecorder.onstop = async () => {
        stream.getTracks().forEach(t => t.stop())
        if (chunksRef.current.length === 0) return
 
        setProcessing(true)
        try {
          const mimeType = mediaRecorder.mimeType || 'audio/webm'
          const blob = new Blob(chunksRef.current, { type: mimeType })
          const formData = new FormData()
          formData.append('audio', blob, 'audio.webm')
 
          const res = await fetch('/api/transcribe', {
            method: 'POST',
            body: formData,
          })
          const data = await res.json()
          if (data.text) onResult(data.text)
        } catch (e) {
          console.error('Whisper error:', e)
        }
        setProcessing(false)
      }
 
      mediaRecorderRef.current = mediaRecorder
      mediaRecorder.start()
      setListening(true)
    } catch (e) {
      console.error('Mic error:', e)
    }
  }, [onResult])
 
  const stop = useCallback(() => {
    mediaRecorderRef.current?.stop()
    setListening(false)
  }, [])
 
  const toggle = useCallback(() => {
    if (listening) stop()
    else start()
  }, [listening, start, stop])
 
  return { listening, processing, toggle, start, stop }
}
 
