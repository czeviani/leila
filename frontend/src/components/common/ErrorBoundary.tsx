import { Component, type ErrorInfo, type ReactNode } from 'react'
import { AlertTriangle } from 'lucide-react'

interface Props {
  children: ReactNode
  fallbackTitle?: string
}

interface State {
  error: Error | null
}

// Sem isto, um erro de render em qualquer componente novo (ex.: DocumentAnalysisPanel)
// derruba a árvore React inteira e a tela fica em branco, sem nenhuma pista pro
// usuário. Isola o blast radius a só a seção que falhou.
export default class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null }

  static getDerivedStateFromError(error: Error): State {
    return { error }
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('[ErrorBoundary]', error, info.componentStack)
  }

  render() {
    if (this.state.error) {
      return (
        <div className="flex items-start gap-3 rounded-2xl border border-red-200 bg-red-50 p-5 text-sm text-red-800">
          <AlertTriangle size={18} className="mt-0.5 flex-shrink-0" />
          <div>
            <p className="font-bold">{this.props.fallbackTitle ?? 'Esta seção não pôde ser exibida.'}</p>
            <p className="mt-1 text-xs text-red-700">{this.state.error.message}</p>
          </div>
        </div>
      )
    }
    return this.props.children
  }
}
