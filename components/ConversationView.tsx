
import React, { useState, useRef, useEffect, useCallback } from 'react';
import { startLiveConversation } from '../services/geminiService';
// FIX: Import `decode` and `createBlob` from audio utilities.
import { decodeAudioData, createBlob, decode } from '../utils/audioUtils';
import type { Transcript } from '../types';
import { LiveServerMessage, LiveSession } from '@google/genai';
import { MicIcon, StopCircleIcon } from './common/Icons';

// FIX: Add type assertion for webkitAudioContext to resolve TypeScript error.
const AudioContext = window.AudioContext || (window as any).webkitAudioContext;

const ConversationView: React.FC = () => {
    const [isSessionActive, setIsSessionActive] = useState(false);
    const [transcripts, setTranscripts] = useState<Transcript[]>([]);
    const [error, setError] = useState<string | null>(null);

    const sessionPromiseRef = useRef<Promise<LiveSession> | null>(null);
    const mediaStreamRef = useRef<MediaStream | null>(null);
    const audioContextRef = useRef<AudioContext | null>(null);
    const scriptProcessorRef = useRef<ScriptProcessorNode | null>(null);
    const mediaStreamSourceRef = useRef<MediaStreamAudioSourceNode | null>(null);
    
    // FIX: Refactor audio playback logic to align with Gemini Live API guidelines.
    const outputAudioContextRef = useRef<AudioContext | null>(null);
    const outputNodeRef = useRef<GainNode | null>(null);
    const sourcesRef = useRef(new Set<AudioBufferSourceNode>());
    const nextStartTimeRef = useRef(0);

    // For transcript management
    const currentInputTranscriptionRef = useRef('');
    const currentOutputTranscriptionRef = useRef('');

    const cleanup = useCallback(() => {
        // FIX: Ensure all audio sources are stopped during cleanup.
        sourcesRef.current.forEach(source => source.stop());
        sourcesRef.current.clear();

        if (scriptProcessorRef.current) {
            scriptProcessorRef.current.disconnect();
            scriptProcessorRef.current = null;
        }
        if (mediaStreamSourceRef.current) {
            mediaStreamSourceRef.current.disconnect();
            mediaStreamSourceRef.current = null;
        }
        if (audioContextRef.current && audioContextRef.current.state !== 'closed') {
            audioContextRef.current.close();
            audioContextRef.current = null;
        }
        if (outputAudioContextRef.current && outputAudioContextRef.current.state !== 'closed') {
            outputAudioContextRef.current.close();
            outputAudioContextRef.current = null;
        }
        if (mediaStreamRef.current) {
            mediaStreamRef.current.getTracks().forEach(track => track.stop());
            mediaStreamRef.current = null;
        }
    }, []);

    const stopConversation = useCallback(async () => {
        setIsSessionActive(false);
        if (sessionPromiseRef.current) {
            try {
                const session = await sessionPromiseRef.current;
                session.close();
            } catch (e) {
                console.error("Error closing session", e);
            } finally {
                sessionPromiseRef.current = null;
            }
        }
        cleanup();
    }, [cleanup]);

    const startConversation = useCallback(async () => {
        setError(null);
        setTranscripts([]);
        currentInputTranscriptionRef.current = '';
        currentOutputTranscriptionRef.current = '';

        try {
            const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
            mediaStreamRef.current = stream;
            
            audioContextRef.current = new AudioContext({ sampleRate: 16000 });
            
            // FIX: Set up output audio context according to guidelines.
            const outputAudioContext = new AudioContext({ sampleRate: 24000 });
            outputAudioContextRef.current = outputAudioContext;
            const outputNode = outputAudioContext.createGain();
            outputNode.connect(outputAudioContext.destination);
            outputNodeRef.current = outputNode;
            nextStartTimeRef.current = 0;
            sourcesRef.current.clear();


            sessionPromiseRef.current = startLiveConversation({
                onopen: () => {
                    setIsSessionActive(true);
                    const source = audioContextRef.current!.createMediaStreamSource(stream);
                    mediaStreamSourceRef.current = source;
                    const scriptProcessor = audioContextRef.current!.createScriptProcessor(4096, 1, 1);
                    scriptProcessorRef.current = scriptProcessor;

                    scriptProcessor.onaudioprocess = (audioProcessingEvent) => {
                        const inputData = audioProcessingEvent.inputBuffer.getChannelData(0);
                        const pcmBlob = createBlob(inputData);
                        sessionPromiseRef.current?.then((session) => {
                            session.sendRealtimeInput({ media: pcmBlob });
                        });
                    };
                    source.connect(scriptProcessor);
                    scriptProcessor.connect(audioContextRef.current!.destination);
                },
                onmessage: async (message: LiveServerMessage) => {
                    if (message.serverContent?.inputTranscription) {
                        currentInputTranscriptionRef.current += message.serverContent.inputTranscription.text;
                    }
                    if (message.serverContent?.outputTranscription) {
                        currentOutputTranscriptionRef.current += message.serverContent.outputTranscription.text;
                    }
                    if (message.serverContent?.turnComplete) {
                        const input = currentInputTranscriptionRef.current;
                        const output = currentOutputTranscriptionRef.current;
                        setTranscripts(prev => [
                            ...prev,
                            ...(input ? [{ id: Date.now(), speaker: 'user', text: input }] : []),
                            ...(output ? [{ id: Date.now() + 1, speaker: 'model', text: output }] : []),
                        ]);
                        currentInputTranscriptionRef.current = '';
                        currentOutputTranscriptionRef.current = '';
                    }

                    // FIX: Implement robust audio playback queueing and interruption handling.
                    const base64Audio = message.serverContent?.modelTurn?.parts[0]?.inlineData?.data;
                    if (base64Audio && outputAudioContextRef.current && outputNodeRef.current) {
                        const outputAudioContext = outputAudioContextRef.current;
                        nextStartTimeRef.current = Math.max(
                            nextStartTimeRef.current,
                            outputAudioContext.currentTime,
                        );

                        const audioBuffer = await decodeAudioData(
                            decode(base64Audio),
                            outputAudioContext,
                            24000,
                            1
                        );
                        const source = outputAudioContext.createBufferSource();
                        source.buffer = audioBuffer;
                        source.connect(outputNodeRef.current);
                        source.addEventListener('ended', () => {
                            sourcesRef.current.delete(source);
                        });

                        source.start(nextStartTimeRef.current);
                        nextStartTimeRef.current = nextStartTimeRef.current + audioBuffer.duration;
                        sourcesRef.current.add(source);
                    }
                    
                    const interrupted = message.serverContent?.interrupted;
                    if (interrupted) {
                        sourcesRef.current.forEach(source => source.stop());
                        sourcesRef.current.clear();
                        nextStartTimeRef.current = 0;
                    }
                },
                onerror: (e: ErrorEvent) => {
                    console.error(e);
                    setError('An error occurred during the conversation.');
                    stopConversation();
                },
                onclose: (e: CloseEvent) => {
                    stopConversation();
                },
            });
        } catch (err) {
            console.error(err);
            setError('Failed to start conversation. Please check microphone permissions.');
        }
    }, [stopConversation]);
    
    useEffect(() => {
        return () => {
          stopConversation();
        };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    return (
        <div className="flex flex-col items-center">
            <div className="w-full bg-white rounded-2xl shadow-xl border border-gray-200 p-6">
                <div className="flex justify-between items-center mb-4">
                    <h2 className="text-2xl font-bold">Live Conversation</h2>
                    {!isSessionActive ? (
                        <button onClick={startConversation} className="inline-flex items-center gap-2 px-4 py-2 bg-green-500 text-white font-semibold rounded-full hover:bg-green-600 transition-colors">
                            <MicIcon /> Start
                        </button>
                    ) : (
                        <button onClick={stopConversation} className="inline-flex items-center gap-2 px-4 py-2 bg-red-500 text-white font-semibold rounded-full hover:bg-red-600 transition-colors">
                            <StopCircleIcon /> Stop
                        </button>
                    )}
                </div>

                {error && <p className="text-red-500 mb-4">{error}</p>}
                
                <div className="h-96 bg-gray-50 rounded-lg p-4 overflow-y-auto flex flex-col gap-4">
                    {transcripts.length === 0 && (
                         <div className="flex-grow flex items-center justify-center text-gray-500">
                            <p>{isSessionActive ? "Start speaking..." : "Press 'Start' to begin the conversation."}</p>
                         </div>
                    )}
                    {transcripts.map((t) => (
                        <div key={t.id} className={`flex flex-col ${t.speaker === 'user' ? 'items-end' : 'items-start'}`}>
                            <div className={`max-w-xs md:max-w-md p-3 rounded-2xl ${t.speaker === 'user' ? 'bg-orange-500 text-white rounded-br-none' : 'bg-gray-200 text-gray-800 rounded-bl-none'}`}>
                                <p>{t.text}</p>
                            </div>
                        </div>
                    ))}
                </div>
            </div>
        </div>
    );
};

export default ConversationView;