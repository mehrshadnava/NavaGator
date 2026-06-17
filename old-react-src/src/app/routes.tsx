import { createBrowserRouter } from 'react-router';
import { Layout } from './components/Layout';
import { Dashboard } from './pages/Dashboard';
import { Projects } from './pages/Projects';
import { ProjectDetail } from './pages/ProjectDetail';
import { Teams } from './pages/Teams';
import { Reports } from './pages/Reports';

function withLayout(Component: React.ComponentType) {
  return function WrappedWithLayout() {
    return (
      <Layout>
        <Component />
      </Layout>
    );
  };
}

export const router = createBrowserRouter([
  { path: '/', Component: withLayout(Dashboard) },
  { path: '/projects', Component: withLayout(Projects) },
  { path: '/projects/:id', Component: withLayout(ProjectDetail) },
  { path: '/teams', Component: withLayout(Teams) },
  { path: '/reports', Component: withLayout(Reports) },
]);
