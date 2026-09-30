import * as React from 'npm:react@18.3.1'
import {
  Body, Button, Container, Head, Heading, Hr, Html, Preview, Section, Text,
} from 'npm:@react-email/components@0.0.22'
import type { TemplateEntry } from './registry.ts'

interface Props {
  tenantName?: string
  propertyLabel?: string
  handoverDate?: string
  reportUrl?: string
  linkDays?: number
}

const CheckinReportReady = ({ tenantName, propertyLabel, handoverDate, reportUrl, linkDays }: Props) => (
  <Html lang="es" dir="ltr">
    <Head />
    <Preview>Tu informe de entrega del departamento ya está disponible</Preview>
    <Body style={main}>
      <Container style={container}>
        <Text style={brand}>Homie</Text>
        <Heading style={h1}>Informe de entrega de tu departamento</Heading>
        <Text style={text}>{tenantName ? `Hola ${tenantName},` : 'Hola,'}</Text>
        <Text style={text}>
          Te compartimos el informe de entrega{propertyLabel ? <> de <strong>{propertyLabel}</strong></> : null}
          {handoverDate ? <>, realizado el {handoverDate}</> : null}. En él queda registrado el estado del
          inmueble al momento de recibirlo, con fotos y observaciones.
        </Text>
        <Text style={text}>Te recomendamos descargarlo y guardarlo: te servirá al término del contrato.</Text>
        {reportUrl && (
          <Section style={{ textAlign: 'center', margin: '28px 0' }}>
            <Button href={reportUrl} style={button}>Descargar informe (PDF)</Button>
          </Section>
        )}
        {linkDays ? (
          <Text style={muted}>El enlace de descarga es válido por {linkDays} días.</Text>
        ) : null}
        <Hr style={hr} />
        <Text style={muted}>
          Si tienes dudas sobre el informe, responde a tu Property Advisor de Homie.
        </Text>
      </Container>
    </Body>
  </Html>
)

export const template = {
  component: CheckinReportReady,
  subject: (d: Record<string, any>) =>
    d?.propertyLabel ? `Informe de entrega · ${d.propertyLabel}` : 'Tu informe de entrega de Homie',
  displayName: 'Informe de check-in al inquilino',
  previewData: {
    tenantName: 'María González',
    propertyLabel: 'Av. Providencia 1234 D 802',
    handoverDate: '30 de septiembre de 2026',
    reportUrl: 'https://app.inspection.homie.mx',
    linkDays: 30,
  },
} satisfies TemplateEntry

const main = { backgroundColor: '#ffffff', fontFamily: 'Inter, Arial, sans-serif' }
const container = { padding: '32px 28px', maxWidth: '560px' }
const brand = { color: '#525EA2', fontSize: '20px', fontWeight: 700, margin: '0 0 24px' }
const h1 = { color: '#1F2340', fontSize: '22px', fontWeight: 700, margin: '0 0 20px' }
const text = { color: '#3A3F5C', fontSize: '15px', lineHeight: '24px', margin: '0 0 14px' }
const muted = { color: '#6B7090', fontSize: '13px', lineHeight: '20px', margin: '0 0 8px' }
const button = {
  backgroundColor: '#525EA2', color: '#ffffff', borderRadius: '8px',
  padding: '12px 22px', fontSize: '15px', fontWeight: 600, textDecoration: 'none',
}
const hr = { borderColor: '#EEF1F8', margin: '24px 0' }
