import { Toaster } from "@/components/ui/toaster"
import { QueryClientProvider } from '@tanstack/react-query'
import { queryClientInstance } from '@/lib/query-client'
import { BrowserRouter as Router, Route, Routes, useLocation, Navigate } from 'react-router-dom';
import PageNotFound from './lib/PageNotFound';
import { AuthProvider, useAuth } from '@/lib/AuthContext';
import UserNotRegisteredError from '@/components/UserNotRegisteredError';

import WidgetHost from "@/pages/WidgetHost";
import Home from './pages/Home';
import Pricing from './pages/Pricing';
import Dashboard from './pages/Dashboard';
import Contacts from './pages/Contacts';
import Campaigns from './pages/Campaigns';
import SocialHub from './pages/SocialHub';
import MediaStudio from './pages/MediaStudio';
import VideoEditor from './pages/VideoEditor';
import AdCreator from './pages/AdCreator';
import ScriptWriter from './pages/ScriptWriter';
import WebsiteScanner from './pages/WebsiteScanner';
import FunnelBuilder from './pages/FunnelBuilder';
import LeadCapturePage from './pages/LeadCapturePage';
import FollowUp from './pages/FollowUp';
import MediaLibrary from './pages/MediaLibrary';
import WebProjects from './pages/WebProjects';
import Analytics from './pages/Analytics';
import Settings from './pages/Settings';
import Billing from './pages/Billing';
import PostPaymentOnboarding from './pages/PostPaymentOnboarding';
import AdminDashboard from './pages/AdminDashboard';
import AppLayout from './components/layout/AppLayout';
import Login from './pages/Login';
import Notifications from './pages/Notifications';
import HelpCenter from './pages/HelpCenter';
import AffiliatePortal from './pages/AffiliatePortal';
import AgencyPortal from './pages/AgencyPortal';
import BetaSignup from './pages/BetaSignup';
import BetaOnboarding from './pages/BetaOnboarding';
import AgentProgram from './pages/AgentProgram';
import AgencyEnquiry from './pages/AgencyEnquiry';

const AuthenticatedApp = () => {
  const { isLoadingAuth, isLoadingPublicSettings, authError, navigateToLogin } = useAuth();

  if (isLoadingPublicSettings || isLoadingAuth) {
    return (
      <div className="fixed inset-0 flex items-center justify-center bg-[#0a0a0a]">
        <div className="flex flex-col items-center gap-4">
          <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-fuchsia-500 to-purple-600 flex items-center justify-center shadow-lg shadow-fuchsia-500/20">
            <span className="text-white font-black text-lg">M</span>
          </div>
          <div className="w-8 h-8 border-2 border-white/10 border-t-fuchsia-500 rounded-full animate-spin"></div>
        </div>
      </div>
    );
  }

  if (authError) {
    if (authError.type === 'user_not_registered') {
      return <UserNotRegisteredError />;
    } else if (authError.type === 'auth_required') {
      const publicPaths = new Set(["/", "/Home", "/home", "/pricing", "/Pricing", "/WidgetHost", "/PromoSignup", "/login"]);
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
      <Route path="/login" element={<Login />} />
      <Route path="/onboarding" element={<PostPaymentOnboarding />} />
      <Route path="/lead-capture" element={<LeadCapturePage />} />
      <Route path="/beta" element={<BetaSignup />} />
      <Route path="/invite/:token" element={<BetaOnboarding />} />
      <Route path="/invite" element={<BetaOnboarding />} />
      <Route path="/agent-program" element={<AgentProgram />} />
      <Route path="/agency-enquiry" element={<AgencyEnquiry />} />

      <Route element={<AppLayout />}>
        <Route path="/dashboard" element={<Dashboard />} />
        <Route path="/contacts" element={<Contacts />} />
        <Route path="/campaigns" element={<Campaigns />} />
        <Route path="/social-hub" element={<SocialHub />} />
        <Route path="/media-studio" element={<MediaStudio />} />
        <Route path="/video-editor" element={<VideoEditor />} />
        <Route path="/ad-creator" element={<AdCreator />} />
        <Route path="/script-writer" element={<ScriptWriter />} />
        <Route path="/website-scanner" element={<WebsiteScanner />} />
        <Route path="/funnel-builder" element={<FunnelBuilder />} />
        <Route path="/follow-up" element={<FollowUp />} />
        <Route path="/media-library" element={<MediaLibrary />} />
        <Route path="/web-projects" element={<WebProjects />} />
        <Route path="/analytics" element={<Analytics />} />
        <Route path="/settings" element={<Settings />} />
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
  return (
    <QueryClientProvider client={queryClientInstance}>
      <AuthProvider>
        <Router>
          <AuthenticatedApp />
        </Router>
        <Toaster />
      </AuthProvider>
    </QueryClientProvider>
  )
}

export default App