import { PecaForm } from '@/components/peca-form'
import { criarPeca } from '../actions'

export default function NovaPecaPage() {
  return <PecaForm action={criarPeca} titulo="Nova peça" />
}
