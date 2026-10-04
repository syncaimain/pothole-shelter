import {type SanityConfig} from '@sanity/sdk'
import {SanityApp} from '@sanity/sdk-react'
import {Office} from './Office'

const config: SanityConfig[] = [{projectId: 'fixjy07h', dataset: 'production'}]

export default function App() {
  return (
    <SanityApp config={config} fallback={<p style={{padding: 24}}>Opening the Shelter Office…</p>}>
      <Office />
    </SanityApp>
  )
}
