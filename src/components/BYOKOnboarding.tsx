import React, { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
    Key,
    ShieldCheck,
    Zap,
    Lock,
    Sparkles,
    ArrowRight,
    CheckCircle2,
    AlertCircle,
    Globe,
    Coins,
    Brain,
    Rocket,
    ExternalLink
} from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { useToast } from "@/hooks/use-toast";

interface BYOKOnboardingProps {
    onComplete: () => void;
}

export const BYOKOnboarding = ({ onComplete }: BYOKOnboardingProps) => {
    // One field, not one per provider. The two-field version implied the user
    // had to understand and supply two engines before anything worked; the code
    // never required it (strataxClient already sends a Gemini-only key as the
    // primary, and the backend routes on key prefix). A second key is still
    // supported -- it just belongs in Bridge Settings, not in the way of a
    // first-time visitor.
    const [apiKey, setApiKey] = useState("");
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [showHelp, setShowHelp] = useState(false);
    const [videoError, setVideoError] = useState(false);
    const [videoRetryToken, setVideoRetryToken] = useState<number>(() => Date.now());
    const [currentStep, setCurrentStep] = useState<'intro' | 'engines'>('intro');
    const { toast } = useToast();

    const demoVideoUrl = ((import.meta as any)?.env?.VITE_BYOK_DEMO_VIDEO_URL as string | undefined) || "/byok/byok-demo.mp4";
    const demoVideoUrlEffective = `${demoVideoUrl}${demoVideoUrl.includes('?') ? '&' : '?'}t=${videoRetryToken}`;

    // Prevent body scroll when modal is open
    useEffect(() => {
        document.body.style.overflow = 'hidden';
        document.body.style.position = 'fixed';
        document.body.style.width = '100%';
        document.body.style.height = '100%';

        return () => {
            document.body.style.overflow = '';
            document.body.style.position = '';
            document.body.style.width = '';
            document.body.style.height = '';
        };
    }, []);

    /**
     * Which provider a pasted key belongs to, by prefix.
     *
     * The same prefixes the backend recognises (`_looks_like_llm_key` in
     * app/utils/demo_mode.py), so the UI and the server agree on what a key is.
     * Returning null for anything else is deliberate: a key we cannot place must
     * not be stored under a provider it does not belong to, because it would
     * then be sent to that provider and come back "invalid" -- blaming a key
     * that is perfectly valid somewhere else.
     */
    const detectProvider = (key: string): "groq" | "gemini" | null => {
        const k = key.trim();
        if (k.startsWith("gsk_")) return "groq";
        if (k.startsWith("AIza") || k.startsWith("ATza")) return "gemini";
        return null;
    };

    const handleSave = () => {
        const key = apiKey.trim();

        if (!key) {
            toast({
                title: "API Key Required",
                description: "Paste your Groq or Gemini API key to continue.",
                variant: "destructive",
            });
            return;
        }

        const provider = detectProvider(key);
        if (!provider) {
            toast({
                title: "Key not recognised",
                description:
                    "This build supports Groq (gsk_…) and Gemini (AIza…) keys. " +
                    "Keys from other providers won't work yet.",
                variant: "destructive",
            });
            return;
        }

        setIsSubmitting(true);
        setTimeout(() => {
            // One connection, used by every AI-powered feature: strataxClient
            // attaches whichever key is stored to all requests.
            localStorage.setItem(provider === "groq" ? "user_api_key" : "gemini_api_key", key);

            setIsSubmitting(false);
            toast({
                title: provider === "groq" ? "⚡ Connected via Groq" : "🧠 Connected via Gemini",
                description: "All AI features are unlocked. You can add a second key later in Bridge Settings.",
            });

            onComplete();
        }, 900);
    };

    if (currentStep === 'intro') {
        return (
            <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="fixed inset-0 z-[100] bg-zinc-950 flex flex-col md:items-center md:justify-center"
            >
                <motion.div
                    initial={{ y: "100%", opacity: 0 }}
                    animate={{ y: 0, opacity: 1 }}
                    transition={{ type: "spring", damping: 30, stiffness: 300, mass: 0.8 }}
                    className="w-full max-h-screen md:h-auto md:max-h-[90vh] md:max-w-2xl bg-zinc-950 md:border md:border-white/10 md:rounded-[2.5rem] shadow-2xl flex flex-col overflow-hidden"
                >
                    <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-purple-500 via-blue-500 to-purple-500" />

                    <div className="flex-1 overflow-y-auto px-6 py-12 md:px-12 md:py-16 space-y-8 scrollbar-hide">
                        <div className="text-center space-y-4">
                            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-purple-500/10 border border-purple-500/20 text-purple-400 text-[10px] uppercase tracking-widest font-bold">
                                <Sparkles className="w-3 h-3" />
                                Enterprise AI Architecture
                            </div>
                            <h2 className="text-3xl md:text-4xl font-bold tracking-tight text-white">
                                Powered by <span className="text-transparent bg-clip-text bg-gradient-to-r from-purple-400 to-blue-400">Specialized AI Engines</span>
                            </h2>
                            <p className="text-zinc-400 text-sm md:text-base max-w-lg mx-auto leading-relaxed">
                                Stratax AI uses two specialized engines, each optimized for different tasks. This architecture delivers unmatched performance and quality.
                            </p>
                        </div>

                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            {/* Interview Engine */}
                            <div className="p-6 rounded-2xl bg-gradient-to-br from-orange-500/10 to-red-500/10 border border-orange-500/20 space-y-4">
                                <div className="flex items-center gap-3">
                                    <div className="p-3 rounded-xl bg-orange-500/20">
                                        <Zap className="w-6 h-6 text-orange-400" />
                                    </div>
                                    <div>
                                        <h3 className="font-bold text-white text-lg">Interview Engine</h3>
                                        <p className="text-xs text-orange-400/80">Powered by Groq</p>
                                    </div>
                                </div>
                                <div className="space-y-2">
                                    <p className="text-sm text-zinc-300 font-medium">Powers:</p>
                                    <ul className="space-y-1.5">
                                        <li className="flex items-center gap-2 text-xs text-zinc-400">
                                            <div className="w-1 h-1 rounded-full bg-orange-400" />
                                            Question Generation
                                        </li>
                                        <li className="flex items-center gap-2 text-xs text-zinc-400">
                                            <div className="w-1 h-1 rounded-full bg-orange-400" />
                                            Mock Interviews
                                        </li>
                                        <li className="flex items-center gap-2 text-xs text-zinc-400">
                                            <div className="w-1 h-1 rounded-full bg-orange-400" />
                                            Search Intelligence
                                        </li>
                                    </ul>
                                </div>
                                <div className="pt-2 border-t border-white/5">
                                    <p className="text-[10px] text-zinc-500 leading-relaxed">
                                        Ultra-fast responses with no safety blocks for technical content
                                    </p>
                                </div>
                            </div>

                            {/* Answer Engine */}
                            <div className="p-6 rounded-2xl bg-gradient-to-br from-blue-500/10 to-purple-500/10 border border-blue-500/20 space-y-4">
                                <div className="flex items-center gap-3">
                                    <div className="p-3 rounded-xl bg-blue-500/20">
                                        <Brain className="w-6 h-6 text-blue-400" />
                                    </div>
                                    <div>
                                        <h3 className="font-bold text-white text-lg">Answer Engine</h3>
                                        <p className="text-xs text-blue-400/80">Powered by Gemini</p>
                                    </div>
                                </div>
                                <div className="space-y-2">
                                    <p className="text-sm text-zinc-300 font-medium">Powers:</p>
                                    <ul className="space-y-1.5">
                                        <li className="flex items-center gap-2 text-xs text-zinc-400">
                                            <div className="w-1 h-1 rounded-full bg-blue-400" />
                                            Advanced Answer Card
                                        </li>
                                        <li className="flex items-center gap-2 text-xs text-zinc-400">
                                            <div className="w-1 h-1 rounded-full bg-blue-400" />
                                            Deep Explanations
                                        </li>
                                        <li className="flex items-center gap-2 text-xs text-zinc-400">
                                            <div className="w-1 h-1 rounded-full bg-blue-400" />
                                            Structured Learning
                                        </li>
                                    </ul>
                                </div>
                                <div className="pt-2 border-t border-white/5">
                                    <p className="text-[10px] text-zinc-500 leading-relaxed">
                                        Long-form, comprehensive answers with perfect structure
                                    </p>
                                </div>
                            </div>
                        </div>

                        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                            <div className="p-4 rounded-xl bg-white/5 border border-white/5 text-center">
                                <ShieldCheck className="w-5 h-5 text-green-400 mx-auto mb-2" />
                                <p className="text-xs font-semibold text-white">100% Private</p>
                                <p className="text-[10px] text-zinc-500">Local storage</p>
                            </div>
                            <div className="p-4 rounded-xl bg-white/5 border border-white/5 text-center">
                                <Coins className="w-5 h-5 text-blue-400 mx-auto mb-2" />
                                <p className="text-xs font-semibold text-white">Free tier</p>
                                <p className="text-[10px] text-zinc-500">Provider plans</p>
                            </div>
                            <div className="p-4 rounded-xl bg-white/5 border border-white/5 text-center">
                                <Rocket className="w-5 h-5 text-purple-400 mx-auto mb-2" />
                                <p className="text-xs font-semibold text-white">Bring-your-key</p>
                                <p className="text-[10px] text-zinc-500">Rate limits may apply</p>
                            </div>
                        </div>
                    </div>

                    <div className="flex-shrink-0 p-6 md:p-8 border-t border-white/5 bg-zinc-950">
                        <Button
                            onClick={() => setCurrentStep('engines')}
                            className="w-full h-14 bg-white text-black hover:bg-zinc-200 rounded-xl font-bold text-lg shadow-lg transition-all active:scale-[0.98]"
                        >
                            Connect Your Engines
                            <ArrowRight className="w-5 h-5 ml-2" />
                        </Button>
                    </div>
                </motion.div>
            </motion.div>
        );
    }

    return (
        <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[100] bg-zinc-950 flex flex-col md:items-center md:justify-center"
        >
            <motion.div
                initial={{ x: "100%", opacity: 0 }}
                animate={{ x: 0, opacity: 1 }}
                transition={{ type: "spring", damping: 30, stiffness: 300 }}
                className="w-full max-h-screen md:h-auto md:max-h-[90vh] md:max-w-6xl bg-zinc-950 md:border md:border-white/10 md:rounded-[2.5rem] shadow-2xl flex flex-col overflow-hidden"
            >
                <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-purple-500 via-blue-500 to-purple-500" />

                <div className="flex-shrink-0 px-6 pt-12 pb-6 md:px-12 md:pt-10 text-center border-b border-white/5">
                    <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-purple-500/10 border border-purple-500/20 text-purple-400 text-[10px] uppercase tracking-widest font-bold mb-4">
                        <Key className="w-3 h-3" />
                        Engine Configuration
                    </div>
                    {/* Singular, and no "required/optional" split: there is one
                        field and one key, and it serves every AI feature. The
                        previous copy described the two-engine setup this
                        replaced. */}
                    <h2 className="text-2xl md:text-3xl font-bold tracking-tight text-white mb-2">
                        Connect your engine
                    </h2>
                    <p className="text-zinc-400 text-sm max-w-md mx-auto">
                        One API key unlocks every AI feature — Copilot, Mock Interview, Live Practice and Run Code.
                    </p>
                </div>

                <div className="flex-1 overflow-y-auto px-6 py-6 md:px-12 scrollbar-hide">
                    <div className="grid grid-cols-1 lg:grid-cols-[480px_360px] gap-6 justify-center">

                        {/* Center: key form */}
                        <div className="space-y-6">
                            {/* One engine field. Whichever provider the key
                                belongs to is detected from its prefix, and the
                                same connection serves every AI feature. */}
                            <div className="space-y-3">
                                <div className="flex items-center gap-3">
                                    <div className="p-2 rounded-lg bg-blue-500/20">
                                        <Zap className="w-5 h-5 text-blue-400" />
                                    </div>
                                    <div>
                                        <h3 className="font-bold text-white text-sm">Connect your engine</h3>
                                        <p className="text-xs text-zinc-500">One key • Powers every AI feature</p>
                                    </div>
                                </div>

                                <div className="relative">
                                    <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none">
                                        <Lock className="h-4 w-4 text-zinc-500" />
                                    </div>
                                    <Input
                                        type="password"
                                        placeholder="Paste your API key (gsk_... or AIza...)"
                                        className="pl-11 h-12 bg-black/40 border-zinc-800 text-white rounded-xl focus:ring-blue-500/40 focus:border-blue-500/60 transition-all"
                                        value={apiKey}
                                        onChange={(e) => setApiKey(e.target.value)}
                                        onKeyDown={(e) => { if (e.key === "Enter") handleSave(); }}
                                    />
                                </div>

                                <p className="text-[11px] text-zinc-500 leading-relaxed">
                                    Groq or Gemini, whichever you have. Both offer a free tier. You can add
                                    a second key later in Bridge Settings.
                                </p>
                            </div>

                            <div className="pt-2 space-y-3">
                        <div className="flex items-center justify-center gap-2 text-[11px] text-zinc-500">
                            <Globe className="w-3.5 h-3.5" />
                            <button
                                onClick={() => setShowHelp(!showHelp)}
                                className="underline text-zinc-400 hover:text-white transition-colors"
                            >
                                {showHelp ? "Hide setup guides" : "Need API keys?"}
                            </button>
                        </div>

                        <AnimatePresence>
                            {showHelp && (
                                <motion.div
                                    initial={{ opacity: 0, height: 0 }}
                                    animate={{ opacity: 1, height: "auto" }}
                                    exit={{ opacity: 0, height: 0 }}
                                    className="space-y-2 overflow-hidden"
                                >
                                    <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                                        <a href="https://console.groq.com/keys" target="_blank" rel="noopener noreferrer"
                                            className="flex items-center justify-between p-4 rounded-xl bg-orange-500/5 border border-orange-500/20 hover:bg-orange-500/10 transition-colors group">
                                            <div className="flex items-center gap-2">
                                                <Zap className="w-4 h-4 text-orange-400" />
                                                <span className="text-xs font-semibold text-white">Get Groq Key</span>
                                            </div>
                                            <ExternalLink className="w-3 h-3 text-zinc-600 group-hover:text-orange-400 transition-colors" />
                                        </a>
                                        <a href="https://aistudio.google.com/app/apikey" target="_blank" rel="noopener noreferrer"
                                            className="flex items-center justify-between p-4 rounded-xl bg-blue-500/5 border border-blue-500/20 hover:bg-blue-500/10 transition-colors group">
                                            <div className="flex items-center gap-2">
                                                <Brain className="w-4 h-4 text-blue-400" />
                                                <span className="text-xs font-semibold text-white">Get Gemini Key</span>
                                            </div>
                                            <ExternalLink className="w-3 h-3 text-zinc-600 group-hover:text-blue-400 transition-colors" />
                                        </a>
                                    </div>
                                    <p className="text-[10px] text-zinc-500 leading-relaxed">
                                        Creating keys is usually free on provider free tiers, but limits/quotas can vary by account and plan.
                                    </p>
                                </motion.div>
                            )}
                        </AnimatePresence>
                    </div>
                        </div>

                        {/* Right: demo video */}
                        <div className="space-y-2 self-start lg:sticky lg:top-6 lg:max-h-[calc(100vh-260px)] lg:overflow-auto scrollbar-hide pr-1">
                            <div className="p-3 rounded-xl bg-white/5 border border-white/10">
                                <div className="flex items-center justify-between gap-2 mb-2">
                                    <p className="text-[10px] font-bold text-white uppercase tracking-wider">Demo video</p>
                                </div>

                                {!videoError ? (
                                    <video
                                        className="w-full rounded-lg border border-white/10 bg-black"
                                        controls
                                        playsInline
                                        preload="metadata"
                                        src={demoVideoUrlEffective}
                                        onError={() => setVideoError(true)}
                                    />
                                ) : (
                                    <div className="space-y-2">
                                        <p className="text-[10px] text-zinc-400 leading-relaxed">
                                            Demo video failed to load.
                                        </p>
                                        <div className="flex items-center gap-2">
                                            <button
                                                type="button"
                                                className="text-[10px] font-semibold text-zinc-300 underline hover:text-white"
                                                onClick={() => {
                                                    setVideoError(false);
                                                    setVideoRetryToken(Date.now());
                                                }}
                                            >
                                                Retry
                                            </button>
                                            <a
                                                href={demoVideoUrlEffective}
                                                target="_blank"
                                                rel="noopener noreferrer"
                                                className="text-[10px] font-semibold text-zinc-300 underline hover:text-white"
                                            >
                                                Open direct
                                            </a>
                                        </div>
                                        <p className="text-[10px] text-zinc-500 leading-relaxed">
                                            If you haven’t deployed the latest build yet, redeploy so
                                            <span className="font-mono"> /byok/byok-demo.mp4</span> exists.
                                        </p>
                                    </div>
                                )}

                                <p className="mt-2 text-[10px] text-zinc-500 leading-relaxed">
                                    Creating keys is usually free on provider free tiers, but limits/quotas can vary by account and plan.
                                </p>
                            </div>
                        </div>
                    </div>
                </div>

                <div className="flex-shrink-0 p-6 md:p-8 border-t border-white/5 bg-zinc-950">
                    <div className="w-full max-w-xl mx-auto space-y-3">
                        <Button
                            disabled={isSubmitting}
                            onClick={handleSave}
                            className="w-full h-14 bg-white text-black hover:bg-zinc-200 rounded-xl font-bold text-lg shadow-lg transition-all active:scale-[0.98]"
                        >
                            {isSubmitting ? "Connecting..." : (
                                <>
                                    Connect
                                    <ArrowRight className="w-5 h-5 ml-2" />
                                </>
                            )}
                        </Button>
                        {/* The way out for someone who has no key and does not
                            want to go and create one just to find out whether
                            the product is any good. Every LLM-backed route now
                            requires the caller's own key, so without this the
                            only alternative to this dialog is leaving. */}
                        <p className="text-center text-xs text-zinc-500">
                            Don’t have a key yet?{" "}
                            <a href="/showcase" className="font-semibold text-zinc-300 underline hover:text-white">
                                See real output first
                            </a>{" "}
                            — no key needed.
                        </p>
                        <p className="text-center text-[10px] text-zinc-600 uppercase tracking-widest font-black flex items-center justify-center gap-2">
                            <ShieldCheck className="w-3 h-3" />
                            Keys stored locally • Never transmitted
                        </p>
                    </div>
                </div>
            </motion.div>
        </motion.div>
    );
};
