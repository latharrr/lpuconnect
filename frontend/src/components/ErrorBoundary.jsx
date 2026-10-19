import { Component } from 'react';
import { RotateCcw } from 'lucide-react';
import en from '../i18n/en.js';

// Last line of defence: a render error shows a recovery screen instead of a blank page.
export default class ErrorBoundary extends Component {
    state = { error: null };

    static getDerivedStateFromError(error) { return { error }; }

    componentDidCatch(error, info) {
        window.__ucReportError?.(error, info);
    }

    render() {
        if (!this.state.error) return this.props.children;
        return (
            <div className="interior waiting">
                <main className="waiting-body">
                    <h1 className="display">{en['error.title']}</h1>
                    <p>{en['error.body']}</p>
                    <button className="btn btn-red" style={{ marginTop: 24 }} onClick={() => location.reload()}>
                        <RotateCcw /> {en['error.reload']}
                    </button>
                </main>
            </div>
        );
    }
}
