import { Component, type ReactNode } from 'react'

/**
 * Keeps one broken screen from blanking the whole app. The last screen is remembered across reloads, so without
 * this a crash would come back every time the app is opened.
 */
export class ErrorBoundary extends Component<{ children: ReactNode; onReset: () => void }, { error: Error | null }> {
  state = { error: null as Error | null }

  static getDerivedStateFromError(error: Error) {
    return { error }
  }

  render() {
    if (!this.state.error) return this.props.children
    return (
      <div className="empty" style={{ gridColumn: '1 / -1' }}>
        <h2>이 화면에서 문제가 생겼어요</h2>
        <p>작업한 내용은 저장돼 있어요. 첫 화면으로 돌아가서 다시 시도해주세요.</p>
        <small style={{ color: 'var(--muted)' }}>{this.state.error.message}</small>
        <button
          className="btn primary"
          onClick={() => {
            this.setState({ error: null })
            this.props.onReset()
          }}
        >
          첫 화면으로
        </button>
      </div>
    )
  }
}
