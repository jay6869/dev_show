import './styles/base.css';
import './styles/tokens.css';
import './styles/layout.css';
import './styles/components.css';
import './utils/easing';
import { App } from './core/App';

const app = new App();
app.start().catch((err: unknown) => {
  console.error('[hexachord] boot failed', err);
  document.documentElement.classList.remove('is-loading', 'is-gated');
  document.documentElement.classList.add('no-webgl');
});

if (import.meta.hot) {
  import.meta.hot.dispose(() => app.dispose());
}
