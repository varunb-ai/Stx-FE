import { useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { Button } from './ui/button';
import { Input } from './ui/input';
import { Label } from './ui/label';
import { Alert, AlertDescription } from './ui/alert';
import { Mail, Lock, ArrowRight, Loader2, AlertCircle } from 'lucide-react';
import { motion } from 'framer-motion';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from './ui/dialog';
import { useToast } from '@/hooks/use-toast';
import { forgotPassword } from '@/lib/authApi';

export function Login({ onSwitchToRegister }: { onSwitchToRegister?: () => void }) {
  const { login, loginWithGoogle } = useAuth();
  const { toast } = useToast();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [googleLoading, setGoogleLoading] = useState(false);

  const [forgotOpen, setForgotOpen] = useState(false);
  const [forgotEmail, setForgotEmail] = useState('');
  const [forgotSubmitting, setForgotSubmitting] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      await login(email, password);
      // Success - AuthContext will handle state updates
    } catch (err: any) {
      setError(err.message || 'Login failed. Please check your credentials.');
    } finally {
      setLoading(false);
    }
  };

  const handleGoogleLogin = async () => {
    setError('');
    setGoogleLoading(true);
    
    try {
      await loginWithGoogle();
      // Success - AuthContext will handle state updates
    } catch (err: any) {
      setError(err.message || 'Google login failed. Please try again.');
    } finally {
      setGoogleLoading(false);
    }
  };

  const openForgot = () => {
    setForgotEmail((prev) => prev || email);
    setForgotOpen(true);
  };

  const submitForgot = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!forgotEmail.trim()) return;

    setForgotSubmitting(true);
    try {
      // Always show a generic success message (even if email not found)
      await forgotPassword(forgotEmail.trim());
    } catch {
      // intentionally ignored
    } finally {
      setForgotSubmitting(false);
      toast({
        title: 'If an account exists, we sent an email',
        description: 'Check your inbox for a password reset link.',
      });
      setForgotOpen(false);
    }
  };

  return (
    <div className="w-full">
      <div className="mb-8">
        <p
          className="text-muted-foreground uppercase mb-3"
          style={{ fontFamily: "'JetBrains Mono', ui-monospace, monospace", fontSize: '0.62rem', letterSpacing: '0.16em' }}
        >
          Sign in
        </p>
        {/* Solid, not a gradient fill: one accent, and type carries the weight. */}
        <h2
          className="text-3xl font-semibold text-foreground mb-2"
          style={{ letterSpacing: '-0.035em' }}
        >
          Welcome back
        </h2>
        <p className="text-muted-foreground">
          Pick up where your last session left off.
        </p>
      </div>

      <form onSubmit={handleSubmit} className="space-y-6">
        {error && (
          <motion.div
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
          >
            <Alert variant="destructive" className="bg-red-500/10 border-red-500/50 backdrop-blur-sm">
              <AlertCircle className="h-4 w-4" />
              <AlertDescription className="text-sm">{error}</AlertDescription>
            </Alert>
          </motion.div>
        )}
        
        <div className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="email" className="text-sm font-medium">
              Email Address
            </Label>
            <div className="relative">
              {/* Icon removed */}
              <Input
                id="email"
                type="email"
                placeholder="you@example.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                disabled={loading}
                className="pl-2 h-12 bg-transparent border-border backdrop-blur-sm focus:border-primary/60 focus:ring-primary/20 transition-all"
              />
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="password" className="text-sm font-medium">
              Password
            </Label>
            <div className="relative">
              {/* Icon removed */}
              <Input
                id="password"
                type="password"
                placeholder="••••••••"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                disabled={loading}
                className="pl-2 h-12 bg-transparent border-border backdrop-blur-sm focus:border-primary/60 focus:ring-primary/20 transition-all"
              />
            </div>
            <div className="flex justify-end">
              <button
                type="button"
                onClick={openForgot}
                disabled={loading || googleLoading}
                className="text-xs text-muted-foreground hover:text-foreground transition-colors py-2 px-1 min-h-[44px] flex items-center"
              >
                Forgot password?
              </button>
            </div>
          </div>
        </div>

        <div className="space-y-4">
          <Button
            type="submit"
            className="w-full h-12 bg-primary hover:bg-primary/90 text-primary-foreground shadow-lg shadow-primary/20 transition-all duration-300 group relative overflow-hidden"
            disabled={loading || googleLoading}
          >
            <span className="relative z-10 flex items-center justify-center gap-2">
              {loading ? (
                <>
                  <Loader2 className="h-5 w-5 animate-spin" />
                  Signing in...
                </>
              ) : (
                <>
                  Sign In
                  <ArrowRight className="h-5 w-5 group-hover:translate-x-1 transition-transform" />
                </>
              )}
            </span>
            
          </Button>

          <div className="relative">
            <div className="absolute inset-0 flex items-center">
              <span className="w-full border-t border-border" />
            </div>
            <div className="relative flex justify-center text-xs uppercase">
              <span className="bg-background px-2 text-muted-foreground">Or continue with</span>
            </div>
          </div>

          <Button
            type="button"
            variant="outline"
            className="w-full h-12 bg-card/60 border-border hover:bg-accent/10 transition-all"
            onClick={handleGoogleLogin}
            disabled={loading || googleLoading}
          >
            <span className="flex items-center justify-center gap-2">
              {googleLoading ? (
                <>
                  <Loader2 className="h-5 w-5 animate-spin" />
                  Connecting...
                </>
              ) : (
                <>
                  <svg className="h-5 w-5" viewBox="0 0 24 24">
                    <path
                      fill="#4285F4"
                      d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
                    />
                    <path
                      fill="#34A853"
                      d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
                    />
                    <path
                      fill="#FBBC05"
                      d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
                    />
                    <path
                      fill="#EA4335"
                      d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
                    />
                  </svg>
                  Continue with Google
                </>
              )}
            </span>
          </Button>
          
          {onSwitchToRegister && (
            <div className="text-center">
              <p className="text-sm text-muted-foreground">
                Don't have an account?{' '}
                <button
                  type="button"
                  onClick={onSwitchToRegister}
                  disabled={loading}
                  className="text-primary hover:text-primary/80 font-medium transition-colors inline-flex items-center gap-1 group"
                >
                  Create one now
                  <ArrowRight className="h-3 w-3 group-hover:translate-x-1 transition-transform" />
                </button>
              </p>
            </div>
          )}
        </div>
      </form>

      <div className="mt-8 pt-6 border-t border-border/60">
        <p className="text-xs text-center text-muted-foreground">
          By signing in, you agree to our Terms of Service and Privacy Policy
        </p>
      </div>

      <Dialog open={forgotOpen} onOpenChange={setForgotOpen}>
        <DialogContent className="sm:max-w-[420px]">
          <DialogHeader>
            <DialogTitle>Reset your password</DialogTitle>
          </DialogHeader>
          <form onSubmit={submitForgot} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="forgot_email">Email</Label>
              <Input
                id="forgot_email"
                type="email"
                value={forgotEmail}
                onChange={(e) => setForgotEmail(e.target.value)}
                placeholder="you@example.com"
                disabled={forgotSubmitting}
                required
              />
            </div>
            <Button type="submit" className="w-full" disabled={forgotSubmitting}>
              {forgotSubmitting ? (
                <span className="inline-flex items-center gap-2">
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Sending…
                </span>
              ) : (
                'Send reset link'
              )}
            </Button>
            <p className="text-xs text-muted-foreground">
              We’ll email you a reset link if an account exists for that address.
            </p>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
