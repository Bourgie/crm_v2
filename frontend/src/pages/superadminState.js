// Estado del panel Super Admin agrupado por cluster de dominio con useReducer.
// Cada hook expone la misma API que los useState originales (campo + setCampo),
// incluyendo updates funcionales (setX(prev => ...)), para que los call sites
// del componente no cambien. La regla prefer-useReducer de react-doctor exige
// no acumular muchos useState relacionados en un componente.

import { useReducer } from 'react'

function makeCluster(initial) {
  return function useClusterState() {
    const [state, dispatch] = useReducer((s, action) => {
      if (action.type !== 'set') return s
      const { key, value } = action
      return { ...s, [key]: typeof value === 'function' ? value(s[key]) : value }
    }, initial)
    const api = {}
    for (const key of Object.keys(initial)) {
      api[key] = state[key]
      api['set' + key.charAt(0).toUpperCase() + key.slice(1)] = (value) => dispatch({ type: 'set', key, value })
    }
    return api
  }
}

export const useLoginState = makeCluster({
  loginForm: { usuario: '', password: '' },
  loginErr: '',
  loginLoading: false,
  sa2faStep: null,
  sa2faCode: '',
  sa2faSetup: null,
  sa2faQr: null,
  sa2faSecret: null,
  saConfiar: true,
})

export const useForgotState = makeCluster({
  saForgot: false,
  forgotEmail: '',
  forgotLoading: false,
  forgotSent: false,
  forgotErr: '',
})

export const useResetState = makeCluster({
  saReset: false,
  resetToken: '',
  resetForm: { password: '', repetir: '' },
  resetLoading: false,
  resetDone: false,
  resetErr: '',
})

export const usePassState = makeCluster({
  passModal: false,
  passForm: { password_actual: '', password_nuevo: '', repetir: '' },
})

export const useSaSecState = makeCluster({
  saSecEnabled: null,
  saSecSetup: null,
  saSecCode: '',
  saSecBackup: null,
  saSecDevices: null,
  saSecLoading: false,
  saSecErr: '',
})

export const useEmpState = makeCluster({
  empModal: null,
  empForm: { codigo: '', nombre: '', rubro: 'general', plan_id: '', vencimiento: '', umax: '5', smax: '2', email: '', password: '', mods_extra: [], mods_bloqueados: [] },
  empSaving: false,
})

export const usePlanState = makeCluster({
  planModal: null,
  planForm: { codigo: '', nombre: '', descripcion: '', precio: '', modulos: [], umax: '', smax: '', orden: '99' },
  planSaving: false,
  planIncluirInactivos: false,
  planHighlight: null,
})

export const useProspState = makeCluster({
  prospForm: { nombre:'', telefono:'', email:'', empresa_interes:'', estado:'nuevo', notas:'', asignado_a:'' },
  prospModal: null,
  prospSaving: false,
  prospFiltro: '',
  prospDetalle: null,
  segForm: { tipo:'nota', descripcion:'' },
  segSaving: false,
})

export const useTicketState = makeCluster({
  tickets: [],
  ticketFiltro: 'todos',
  ticketRespuesta: '',
  ticketRespondiendo: null,
  ticketSaving: false,
})

export const useLandingState = makeCluster({
  landingFiltro: 'todos',
  landingStats: null,
  statsDias: 30,
  statsPagina: '',
})

export const useEmailState = makeCluster({
  emailConfig: { smtp_host:'', smtp_port:'465', smtp_user:'', smtp_pass:'', smtp_from:'', smtp_from_name:'Nico' },
  emailSaving: false,
  emailTesting: false,
  emailTestResult: null,
})

export const useAtributoState = makeCluster({
  atributos: [],
  atributoModal: null,
  atributoForm: { rubro:'general', atributo_key:'', atributo_label:'', tipo:'text', opciones:'', orden:'0' },
  atributoSaving: false,
  atributoFiltroRubro: '',
})

export const useMtState = makeCluster({
  mtItems: [],
  mtModal: null,
  mtForm: { tipo:'dominio', nombre:'', descripcion:'', fecha_vencimiento:'', proveedor:'', url:'', notas:'' },
  mtSaving: false,
})

export const useDeleteState = makeCluster({
  deleteModal: null,
  deleteBackup: false,
  deleteEmail: false,
  deleteSaving: false,
})

export const useDelSolState = makeCluster({
  delSolModal: null,
  delSolSaving: false,
  delSolBackup: false,
  delSolEmail: false,
})

export const useAppsState = makeCluster({
  appsData: [],
  appsInstaladas: [],
  appsStats: null,
  appsFiltroCat: '',
  appsFiltroEmp: '',
  appModal: null,
  appForm: { slug:'', nombre:'', version:'1.0.0', descripcion:'', descripcion_larga:'', categoria:'general', icono:'📦', precio_mensual:'0', precio_anual:'0', trial_dias:'0', modulos_requeridos:'', roles_permitidos:'', tags:'', activa:true },
  appSaving: false,
})

export const useLegalState = makeCluster({
  legalEmpresas: null,
  legalAuditData: null,
  legalMsg: '',
  legalMsgErr: false,
})

export const useNotifState = makeCluster({
  notifForm: { empresa: '', tipo: 'manual', titulo: '', mensaje: '' },
  tesSaving: '',
  notifEnviando: false,
  notifMsg: '',
  notifHistorial: null,
})

export const useDetailState = makeCluster({
  empresaDetail: null,
  empresaDetailTab: 'info',
  detailAudit: [],
  detailApps: [],
  detailNotas: [],
  detailPagos: [],
  detailVencimientos: null,
  detailLoading: false,
  detailAuditSearch: '',
  notaForm: { texto: '' },
  notaSaving: false,
  manualPagoModal: null,
  manualPagoForm: { plan_id: '', monto: '', origen: 'manual_efectivo', notas: '' },
  manualPagoSaving: false,
})

export const useMpState = makeCluster({
  mpConfig: null,
  mpSaving: false,
  mpTesting: false,
  mpTestResult: null,
  billingConfig: { grace_days: 3, aviso_dias: '7,3,1,0,-1,-3', mail_subject: '', mail_body: '', suspend_after_grace: false },
  billingSaving: false,
  pagosList: [],
  pagosFiltro: '',
  pagosMes: '',
  webhookLogs: [],
})

export const useDataState = makeCluster({
  dash: null,
  empresas: [],
  planes: [],
  modulos: [],
  solicitudes: [],
  solicitudesElim: [],
  audit: [],
  prospectos: [],
  leads: [],
})