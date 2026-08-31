import { useEffect } from 'react';
import { Toaster } from "@/components/ui/toaster"
import { QueryClientProvider } from '@tanstack/react-query'
import { queryClientInstance } from '@/lib/query-client'
import AdminLogin from './pages/AdminLogin';
import { BrowserRouter as Router, Route, Routes, useLocation, Navigate } from 'react-router-dom';
import PageNotFound from './lib/PageNotFound';
import { AuthProvider, useAuth } from '@/lib/AuthContext';
import UserNotRegisteredError from '@/components/UserNotRegisteredError';
import { trackReferralFromUrl } from '@/utils/affiliate';

import WidgetHost from "@/pages/WidgetHost";
import Home from './pages/Home';
import Pricing from './pages/Pricing';
import Dashboard from './pages/Dashboard';
import Contacts from './pages/Contacts';
import Campaigns from './pages/Campaigns';
import SocialHub from './pages/SocialHub';
import AdCreator from './pages/AdCreator';
import WebsiteScanner from './pages/WebsiteScanner';
import FunnelBuilder from './pages/FunnelBuilder';
import LeadCapturePage from './pages/LeadCapturePage';
import FollowUp from './pages/FollowUp';
import MediaLibrary from './pages/MediaLibrary';
import WebProjects from './pages/WebProjects';
import Analytics from './pages/Analytics';
import Settings from './pages/Settings';
import Integrations from './pages/Integrations';
import Billing from './pages/Billing';
import PostPaymentOnboarding from './pages/PostPaymentOnboarding';
import AdminDashboard from './pages/AdminDashboard';
import AppLayout from './components/layout/AppLayout';
import Auth from './pages/Auth';
import Notifications from './pages/Notifications';
import HelpCenter from './pages/HelpCenter';
import AffiliatePortal from './pages/AffiliatePortal';
import AgencyPortal from './pages/AgencyPortal';
import BetaSignup from './pages/BetaSignup';
import BetaOnboarding from './pages/BetaOnboarding';
import AgentProgram from './pages/AgentProgram';
import AgencyEnquiry from './pages/AgencyEnquiry';
import FreeTrial from './pages/FreeTrial';
import BrandManager from './pages/BrandManager';
import CampaignStudio from './pages/CampaignStudio';
import QuickCreate from './pages/QuickCreate';
import DemoVideoMaker from './pages/DemoVideoMaker';
import MediaEditor from './pages/MediaEditor';
import MovieMaker from './pages/MovieMaker';
import SongCreator from './pages/SongCreator';
import Studio from './pages/Studio';
import DubbingStudio from './pages/DubbingStudio';
import OAuthConsent from './pages/OAuthConsent';
import Privacy from './pages/Privacy';
import Terms from './pages/Terms';


const AuthenticatedApp = () => {
  const { isLoadingAuth, isLoadingPublicSettings, authError, navigateToLogin } = useAuth();

  if (isLoadingPublicSettings || isLoadingAuth) {
    return (
      <div className="fixed inset-0 flex items-center justify-center bg-[#0a0a0a]">
        {/* This is the mark that flashes on every auth check and page
            transition, so it has to be the real one. It was a hardcoded
            letter "M" — a leftover from the MediaStudios name — which meant
            the old brand appeared briefly on literally every navigation. */}
        <div className="flex flex-col items-center gap-4">
          <img src="/brand/icon.png" alt="" width="48" height="48"
            className="w-12 h-12 rounded-xl object-contain"
            onError={(e) => { e.target.style.display = "none"; }} />
          <div className="w-8 h-8 border-2 border-white/10 border-t-fuchsia-500 rounded-full animate-spin"></div>
        </div>
      </div>
    );
  }

  if (authError) {
    if (authError.type === 'user_not_registered') {
      return <UserNotRegisteredError />;
    } else if (authError.type === 'auth_required') {
      const publicPaths = new Set(["/", "/Home", "/home", "/pricing", "/Pricing", "/WidgetHost", "/PromoSignup", "/login", "/auth", "/privacy", "/terms"]);
      if (!publicPaths.has(window.location.pathname)) { navigateToLogin(); }
      return null;
    }
  }

  return (
    <Routes>
      <Route path="/WidgetHost" element={<WidgetHost />} />
      <Route path="/" element={<Home />} />
      <Route path="/Home" element={<Home />} />
      <Route path="/pricing" element={<Pricing />} />
      <Route path="/Pricing" element={<Pricing />} />
      <Route path="/admin/login" element={<AdminLogin />} />
        <Route path="/login" element={<Navigate to="/auth" replace />} />
      <Route path="/auth" element={<Auth />} />
      <Route path="/oauth/consent" element={<OAuthConsent />} />
      {/* src/pages/Privacy.jsx existed but was never routed, so the "Privacy
          Policy" link in the login footer 404'd. It has to resolve publicly:
          Google's OAuth consent screen requires a reachable privacy policy URL
          before it will verify a custom client for digitalstudios.app. */}
      <Route path="/privacy" element={<Privacy />} />
      {/* Google's OAuth verification requires BOTH a privacy policy and a terms
          of service URL, each reachable without signing in, for an external
          production app. */}
      <Route path="/terms" element={<Terms />} />
      <Route path="/onboarding" element={<PostPaymentOnboarding />} />
      <Route path="/lead-capture" element={<LeadCapturePage />} />
      <Route path="/beta" element={<BetaSignup />} />
      <Route path="/invite/:token" element={<BetaOnboarding />} />
      <Route path="/invite" element={<BetaOnboarding />} />
      <Route path="/agent-program" element={<AgentProgram />} />
      <Route path="/agency-enquiry" element={<AgencyEnquiry />} />
<Route path="/free-trial" element={<FreeTrial />} />

      <Route element={<AppLayout />}>
        <Route path="/studio" element={<Studio />} />
        <Route path="/dashboard" element={<Dashboard />} />
        <Route path="/contacts" element={<Contacts />} />
        <Route path="/campaigns" element={<Campaigns />} />
        <Route path="/social-hub" element={<SocialHub />} />
        <Route path="/media-studio" element={<Navigate to="/campaign-studio" replace />} />
        <Route path="/video-editor" element={<Navigate to="/campaign-studio" replace />} />
        <Route path="/script-writer" element={<Navigate to="/campaign-studio" replace />} />
        <Route path="/ad-creator" element={<AdCreator />} />
        <Route path="/brands" element={<BrandManager />} />
        <Route path="/campaign-studio" element={<CampaignStudio />} />
        <Route path="/quick-create" element={<QuickCreate />} />
        <Route path="/demo-video" element={<DemoVideoMaker />} />
        <Route path="/media-editor" element={<MediaEditor />} />
        <Route path="/movie-maker" element={<MovieMaker />} />
        <Route path="/song-creator" element={<SongCreator />} />
        <Route path="/dubbing" element={<DubbingStudio />} />
        <Route path="/website-scanner" element={<WebsiteScanner />} />
        <Route path="/funnel-builder" element={<FunnelBuilder />} />
        <Route path="/follow-up" element={<FollowUp />} />
        <Route path="/media-library" element={<MediaLibrary />} />
        <Route path="/web-projects" element={<WebProjects />} />
        <Route path="/analytics" element={<Analytics />} />
        <Route path="/settings" element={<Settings />} />
        <Route path="/integrations" element={<Integrations />} />
        <Route path="/billing" element={<Billing />} />
        <Route path="/notifications" element={<Notifications />} />
        <Route path="/help" element={<HelpCenter />} />
        <Route path="/affiliate" element={<AffiliatePortal />} />
        <Route path="/agency" element={<AgencyPortal />} />
        <Route path="/admin" element={<AdminDashboard />} />
      </Route>

            <Route path="*" element={<PageNotFound />} />
    </Routes>
  );
};

function App() {
  // Runs once per app load, before auth state settles — a referral link can
  // land an anonymous visitor on any public page, so this can't wait on the
  // authenticated routes below.
  useEffect(() => { trackReferralFromUrl(); }, []);

  return (
    <QueryClientProvider client={queryClientInstance}>
      <AuthProvider>
        <Router>
          AuthenticatedApp
        </Router>
        <Toaster />
      </AuthProvider>
    </QueryClientProvider>
  )
}

export default App