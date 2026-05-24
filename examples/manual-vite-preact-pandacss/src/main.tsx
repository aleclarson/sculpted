import { render } from 'preact'
import { css } from '../styled-system/css'
import './index.css'

type CardProps = {
  title: string
  eyebrow: string
  children: preact.ComponentChildren
}

function Card(props: CardProps) {
  return (
    <section
      class={css({
        backgroundColor: 'white',
        borderColor: 'gray.200',
        borderRadius: '16px',
        borderWidth: '1px',
        boxShadow: '0 18px 50px rgba(15, 23, 42, 0.12)',
        padding: '24px'
      })}
    >
      <p
        class={css({
          color: 'brand.700',
          fontSize: '12px',
          fontWeight: '700',
          letterSpacing: '0.12em',
          margin: '0 0 8px',
          textTransform: 'uppercase'
        })}
      >
        {props.eyebrow}
      </p>
      <h2
        class={css({
          color: 'gray.950',
          fontSize: '24px',
          lineHeight: '1.2',
          margin: '0 0 12px'
        })}
      >
        {props.title}
      </h2>
      <div
        class={css({
          color: 'gray.700',
          fontSize: '16px',
          lineHeight: '1.7'
        })}
      >
        {props.children}
      </div>
    </section>
  )
}

function App() {
  return (
    <main
      class={css({
        backgroundColor: 'brand.50',
        color: 'gray.950',
        minHeight: '100vh',
        padding: '48px'
      })}
    >
      <div
        class={css({
          maxWidth: '960px',
          margin: '0 auto'
        })}
      >
        <header
          class={css({
            marginBottom: '32px'
          })}
        >
          <h1
            class={css({
              color: 'brand.700',
              fontSize: '44px',
              lineHeight: '1.05',
              margin: '0 0 12px'
            })}
          >
            Sculpted manual verification app
          </h1>
          <p
            class={css({
              color: 'gray.700',
              fontSize: '18px',
              lineHeight: '1.7',
              margin: 0,
              maxWidth: '720px'
            })}
          >
            This intentionally uses only Panda CSS <code>css()</code> calls.
            Manual source writeback testing should focus on plain style object
            edits, including raw CSS values and color token values.
          </p>
        </header>

        <div
          class={css({
            display: 'grid',
            gap: '20px',
            gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))'
          })}
        >
          <Card eyebrow="Baseline" title="Static object literal">
            The card styles are authored directly in a <code>css()</code> call so
            writeback can preserve nearby JSX and unrelated styles.
          </Card>
          <Card eyebrow="Tokens" title="Color tokens only">
            The example includes color tokens such as <code>brand.700</code> and
            <code>gray.700</code>. Other design-token families are intentionally
            avoided for the MVP.
          </Card>
          <Card eyebrow="Raw values" title="Non-color CSS values">
            Spacing, shadows, sizes, and grid declarations use raw CSS values to
            keep manual verification focused on the supported writeback shape.
          </Card>
        </div>
      </div>
    </main>
  )
}

render(<App />, document.getElementById('app')!)
