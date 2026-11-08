/**
 * Ícones de traço simples (24×24), desenhados para o app — sem biblioteca externa.
 * Herdam a cor do texto (currentColor) e são decorativos: o rótulo fica no texto ou no aria-label do botão.
 */
const DESENHOS = {
  inicio: (
    <>
      <path d="M3.5 10.5 12 3.5l8.5 7" />
      <path d="M5.5 9v11h4.5v-5.5h4V20h4.5V9" />
    </>
  ),
  agenda: (
    <>
      <rect x="3.5" y="5" width="17" height="15.5" rx="2.5" />
      <path d="M3.5 10h17M8 3v4M16 3v4" />
    </>
  ),
  alunos: (
    <>
      <circle cx="9" cy="8.5" r="3.5" />
      <path d="M2.5 20c.4-3.4 3-5.5 6.5-5.5s6.1 2.1 6.5 5.5" />
      <path d="M15.5 5.2a3.5 3.5 0 0 1 0 6.6M17.8 14.8c2 .7 3.4 2.5 3.7 5.2" />
    </>
  ),
  usuario: (
    <>
      <circle cx="12" cy="8" r="3.8" />
      <path d="M4.5 20.5c.5-4 3.6-6.5 7.5-6.5s7 2.5 7.5 6.5" />
    </>
  ),
  // Planos: três camadas empilhadas — os pacotes de aula (particular, grupo, 1x a 5x por semana).
  planos: (
    <>
      <path d="M11.1 3.7a2 2 0 0 1 1.8 0l7.2 3.7a.7.7 0 0 1 0 1.2l-7.2 3.7a2 2 0 0 1-1.8 0L3.9 8.6a.7.7 0 0 1 0-1.2z" />
      <path d="m3.6 12.1 7.5 3.9a2 2 0 0 0 1.8 0l7.5-3.9" />
      <path d="m3.6 16.1 7.5 3.9a2 2 0 0 0 1.8 0l7.5-3.9" />
    </>
  ),
  // Aulas (registro de presença e diário): a prancheta com o visto.
  aulas: (
    <>
      <path d="M8.5 4.5H7A2.5 2.5 0 0 0 4.5 7v11.5A2.5 2.5 0 0 0 7 21h10a2.5 2.5 0 0 0 2.5-2.5V7A2.5 2.5 0 0 0 17 4.5h-1.5" />
      <rect x="8.5" y="3" width="7" height="3.5" rx="1.3" />
      <path d="m8.8 13.6 2.2 2.2 4.3-4.4" />
    </>
  ),
  // Mensalidades: a cédula.
  mensalidades: (
    <>
      <rect x="2.5" y="6" width="19" height="12.5" rx="2.5" />
      <circle cx="12" cy="12.25" r="2.6" />
      <path d="M6 9.6h.01M18 14.9h.01" />
    </>
  ),
  relatorios: (
    <>
      <path d="M4 20.5h16" />
      <rect x="5.5" y="11" width="3" height="6.5" rx="1" />
      <rect x="10.5" y="5.5" width="3" height="12" rx="1" />
      <rect x="15.5" y="13.5" width="3" height="4" rx="1" />
    </>
  ),
  // "Mais" do menu do celular: as outras páginas.
  grade: (
    <>
      <rect x="4" y="4" width="6.5" height="6.5" rx="1.8" />
      <rect x="13.5" y="4" width="6.5" height="6.5" rx="1.8" />
      <rect x="4" y="13.5" width="6.5" height="6.5" rx="1.8" />
      <rect x="13.5" y="13.5" width="6.5" height="6.5" rx="1.8" />
    </>
  ),
  reposicao: (
    <>
      <path d="M4 12a8 8 0 1 0 8-8 8.7 8.7 0 0 0-6 2.4L4 8.5" />
      <path d="M4 4v4.5h4.5" />
    </>
  ),
  // Histórico (de pagamentos): o relógio com a seta voltando no tempo.
  historico: (
    <>
      <path d="M4 12a8 8 0 1 0 8-8 8.7 8.7 0 0 0-6 2.4L4 8.5" />
      <path d="M4 4v4.5h4.5" />
      <path d="M12 8v4.2l2.7 1.8" />
    </>
  ),
  falta: (
    <>
      <rect x="3.5" y="5" width="17" height="15.5" rx="2.5" />
      <path d="M3.5 10h17M8 3v4M16 3v4" />
      <path d="m10 13.5 4 4M14 13.5l-4 4" />
    </>
  ),
  baixar: (
    <>
      <path d="M12 4v10.5M7.5 10 12 14.5l4.5-4.5" />
      <path d="M4.5 16v2A2.5 2.5 0 0 0 7 20.5h10a2.5 2.5 0 0 0 2.5-2.5v-2" />
    </>
  ),
  email: (
    <>
      <rect x="3" y="5.5" width="18" height="13" rx="2.5" />
      <path d="m3.8 7 8.2 6 8.2-6" />
    </>
  ),
  sair: (
    <>
      <path d="M9.5 20.5H6a2 2 0 0 1-2-2v-13a2 2 0 0 1 2-2h3.5" />
      <path d="m15.5 16.5 4.5-4.5-4.5-4.5M20 12H9.5" />
    </>
  ),
  anterior: <path d="m14.5 6-6 6 6 6" />,
  proximo: <path d="m9.5 6 6 6-6 6" />,
  mais: <path d="M12 5v14M5 12h14" />,
  fechar: <path d="m6.5 6.5 11 11M17.5 6.5l-11 11" />,
  busca: (
    <>
      <circle cx="11" cy="11" r="6.5" />
      <path d="m20 20-4.4-4.4" />
    </>
  ),
  // Marca do EMMOO: a colcheia dupla (♫) dos mockups da RFC — duas cabeças inclinadas ligadas por uma barra.
  // Desenho cheio (sem traço), o mesmo do favicon: nítido de 16 px a tamanhos grandes.
  nota: (
    <g fill="currentColor" stroke="none">
      <ellipse cx="7.4" cy="17.7" rx="3.15" ry="2.3" transform="rotate(-22 7.4 17.7)" />
      <ellipse cx="16.6" cy="15.6" rx="3.15" ry="2.3" transform="rotate(-22 16.6 15.6)" />
      <rect x="8.95" y="6.6" width="1.5" height="10.6" rx="0.2" />
      <rect x="18.1" y="4.5" width="1.5" height="10.6" rx="0.2" />
      <path d="M8.95 6.05 19.6 3.95v2.75L8.95 8.8z" />
    </g>
  ),
  escola: (
    <>
      <path d="M3.5 9.5 12 4.5l8.5 5z" />
      <path d="M6 12v5.5M10 12v5.5M14 12v5.5M18 12v5.5M3.5 20h17" />
    </>
  ),
  cadeado: (
    <>
      <rect x="5" y="10.5" width="14" height="10" rx="2.5" />
      <path d="M8.5 10.5V8a3.5 3.5 0 0 1 7 0v2.5" />
    </>
  ),
  confirmado: <path d="m5.5 12.5 4 4 9-9" />,
  // Confirmações: exclamação para ação que apaga ou tira acesso; interrogação para as demais.
  alerta: (
    <>
      <circle cx="12" cy="12" r="8.5" />
      <path d="M12 7.8v4.6M12 16.1h.01" />
    </>
  ),
  ajuda: (
    <>
      <circle cx="12" cy="12" r="8.5" />
      <path d="M9.7 9.6a2.4 2.4 0 0 1 4.6.9c0 1.6-2.3 2-2.3 3.3M12 16.6h.01" />
    </>
  ),
  relogio: (
    <>
      <circle cx="12" cy="12" r="8.5" />
      <path d="M12 7.5V12l3 2" />
    </>
  ),
  olho: (
    <>
      <path d="M2.5 12S6 5.5 12 5.5 21.5 12 21.5 12 18 18.5 12 18.5 2.5 12 2.5 12z" />
      <circle cx="12" cy="12" r="3" />
    </>
  ),
  olhoFechado: (
    <>
      <path d="M10.6 5.6A9.6 9.6 0 0 1 12 5.5c6 0 9.5 6.5 9.5 6.5a17 17 0 0 1-2.4 3.3M6.6 6.7C4 8.4 2.5 12 2.5 12s3.5 6.5 9.5 6.5c1.7 0 3.2-.5 4.5-1.2" />
      <path d="M9.9 9.9a3 3 0 0 0 4.2 4.2M3.5 3.5l17 17" />
    </>
  ),
  copiar: (
    <>
      <rect x="8.5" y="8.5" width="11" height="11" rx="2.5" />
      <path d="M15.5 8.5v-2a2 2 0 0 0-2-2h-7a2 2 0 0 0-2 2v7a2 2 0 0 0 2 2h2" />
    </>
  ),
  planilha: (
    <>
      <rect x="4" y="4.5" width="16" height="15" rx="2.5" />
      <path d="M4 9.5h16M4 14.5h16M10 9.5v10" />
    </>
  ),
  pix: (
    <>
      <path d="M12 3.5 20.5 12 12 20.5 3.5 12z" />
      <path d="M8.5 12 12 8.5l3.5 3.5-3.5 3.5z" />
    </>
  ),
  editar: (
    <>
      <path d="M4.5 19.5h4l10-10a2.1 2.1 0 0 0-4-4l-10 10z" />
      <path d="m13.5 6.5 4 4" />
    </>
  ),
};

export default function Icone({ nome, tamanho = 20, ...props }) {
  return (
    <svg
      width={tamanho}
      height={tamanho}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.75"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
      {...props}
    >
      {DESENHOS[nome]}
    </svg>
  );
}
