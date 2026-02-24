import { Navigate, Route, Routes } from 'react-router-dom';
import { ErrorBoundary } from '../../components/common/ErrorBoundary';
import { ShellLayout } from '../../components/layout/ShellLayout';
import { ChatPage } from '../../pages/ChatPage';
import { DashboardPage } from '../../pages/DashboardPage';
import { FilesPage } from '../../pages/FilesPage';
import { SkillsPage } from '../../pages/SkillsPage';
import { WebControlPage } from '../../pages/WebControlPage';
import { LogsPage } from '../../pages/LogsPage';
import { SettingsPage } from '../../pages/SettingsPage';
import { BridgeTasksPage } from '../../pages/BridgeTasksPage';

export function AppRoutes() {
  return (
    <Routes>
      <Route path="/" element={<ShellLayout />}>
        <Route index element={<Navigate to="/chat" replace />} />
        <Route path="chat" element={<ErrorBoundary><ChatPage /></ErrorBoundary>} />
        <Route path="dashboard" element={<ErrorBoundary><DashboardPage /></ErrorBoundary>} />
        <Route path="files" element={<ErrorBoundary><FilesPage /></ErrorBoundary>} />
        <Route path="skills" element={<ErrorBoundary><SkillsPage /></ErrorBoundary>} />
        <Route path="web-control" element={<ErrorBoundary><WebControlPage /></ErrorBoundary>} />
        <Route path="logs" element={<ErrorBoundary><LogsPage /></ErrorBoundary>} />
        <Route path="bridge-tasks" element={<ErrorBoundary><BridgeTasksPage /></ErrorBoundary>} />
        <Route path="settings" element={<ErrorBoundary><SettingsPage /></ErrorBoundary>} />
      </Route>
    </Routes>
  );
}
