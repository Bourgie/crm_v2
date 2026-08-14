const { z } = require('zod');

const empresaField = z.string().regex(/^[a-z0-9_]+$/, 'Código de empresa inválido').optional().default('default');

const loginSchema = z.object({
  usuario: z.string().min(1, 'Usuario requerido'),
  password: z.string().min(1, 'Contraseña requerida'),
  empresa: empresaField,
});

const createUserSchema = z.object({
  nombre: z.string().min(1, 'Nombre requerido'),
  usuario: z.string().min(3, 'Usuario debe tener al menos 3 caracteres'),
  email: z.string().email('Email inválido').optional().or(z.literal('')),
  password: z.string().min(8, 'Mínimo 8 caracteres')
    .regex(/[A-Z]/, 'Debe contener al menos una mayúscula')
    .regex(/[0-9]/, 'Debe contener al menos un número')
    .regex(/[^A-Za-z0-9]/, 'Debe contener al menos un símbolo'),
  rol: z.string().optional().default('vendedor'),
  suc_id: z.string().optional().nullable(),
});

const changePasswordSchema = z.object({
  password_actual: z.string().min(1, 'Contraseña actual requerida'),
  password_nuevo: z.string().min(8, 'Mínimo 8 caracteres')
    .regex(/[A-Z]/, 'Debe contener al menos una mayúscula')
    .regex(/[0-9]/, 'Debe contener al menos un número')
    .regex(/[^A-Za-z0-9]/, 'Debe contener al menos un símbolo'),
});

const forgotPasswordSchema = z.object({
  usuario: z.string().min(1, 'Usuario o email requerido'),
  empresa: empresaField,
});

const resetPasswordSchema = z.object({
  token: z.string().min(1, 'Token requerido'),
  password: z.string().min(8, 'Mínimo 8 caracteres')
    .regex(/[A-Z]/, 'Debe contener al menos una mayúscula')
    .regex(/[0-9]/, 'Debe contener al menos un número')
    .regex(/[^A-Za-z0-9]/, 'Debe contener al menos un símbolo'),
  empresa: empresaField,
});

const webhookCreateSchema = z.object({
  url: z.string().url('URL inválida'),
  eventos: z.array(z.string()).min(1, 'Seleccioná al menos un evento'),
});

const superadminLoginSchema = z.object({
  usuario: z.string().min(1, 'Usuario requerido'),
  password: z.string().min(1, 'Contraseña requerida'),
});

const twofaSetupSchema = z.object({}).optional();

const twofaConfirmSchema = z.object({
  temp_token: z.string().optional(),
  confiar_dispositivo: z.boolean().optional(),
  code: z.string().min(6, 'Código de 6 dígitos').max(6, 'Código de 6 dígitos'),
});

const twofaVerifySchema = z.object({
  temp_token: z.string().min(1, 'Token temporal requerido'),
  code: z.string().min(1, 'Código requerido'),
  empresa: empresaField,
});

const twofaDisableSchema = z.object({
  password: z.string().optional(),
  code: z.string().optional(),
});

const superadmin2faVerifySchema = z.object({
  temp_token: z.string().min(1, 'Token temporal requerido'),
  code: z.string().min(1, 'Código requerido'),
});

// ── Entity schemas ──
const ventaItemSchema = z.object({
  prod_id: z.string().min(1),
  variante_id: z.string().optional().nullable(),
  nombre: z.string().min(1),
  talle: z.string().optional().default(''),
  precio: z.number(),
  cantidad: z.number().int().positive(),
  subtotal: z.number(),
  costo: z.number().optional().default(0),
});

const ventaCreateSchema = z.object({
  suc_id: z.string().min(1, 'Sucursal requerida'),
  vend_id: z.string().optional().nullable(),
  cliente_id: z.string().optional().nullable(),
  items: z.array(ventaItemSchema).min(1, 'Al menos un item requerido'),
  subtotal: z.number().optional().default(0),
  descuento: z.number().optional().default(0),
  total: z.number().optional().default(0),
  pago: z.string().optional(),
  comprobante: z.string().optional().default('ticket'),
  es_ctacte: z.boolean().optional().default(false),
  recargo_pago: z.number().optional().default(0),
  envio_monto: z.number().optional().default(0),
  envio_detalle: z.string().optional().default(''),
  vend_nombre_fallback: z.string().optional().default(''),
});

const productoSchema = z.object({
  nombre: z.string().min(1, 'Nombre requerido'),
  precio_l1: z.number({message: 'Precio Lista 1 requerido'}).positive(),
  sku: z.string().optional().default(''),
  codigo_barras: z.string().optional().default(''),
  categoria: z.string().optional().default(''),
  talle: z.string().optional().default(''),
  color: z.string().optional().default(''),
  temporada: z.string().optional().default(''),
  costo: z.number().optional().default(0),
  precio_l2: z.number().optional(),
  precio_l3: z.number().optional(),
  unidad: z.string().optional().default('unidad'),
  stock_min: z.number().int().optional().default(3),
  stock_max: z.number().int().optional().default(20),
  favorito: z.boolean().optional().default(false),
  stock: z.any().optional(),
  stock_suc: z.any().optional(),
  suc_id: z.any().optional(),
});

const clienteSchema = z.object({
  nombre: z.string().min(1, 'Nombre requerido'),
  apellido: z.string().optional().default(''),
  dni: z.string().optional().default(''),
  tel: z.string().optional().default(''),
  email: z.string().optional().default(''),
  ciudad: z.string().optional().default(''),
  bebe_nac: z.string().optional().default(''),
  notas: z.string().optional().default(''),
  lista: z.number().int().min(1).max(3).optional().default(1),
  limite_credito: z.number().optional().default(20000),
  suc_origen: z.string().optional().nullable(),
  direccion: z.string().optional().default(''),
  provincia: z.string().optional().default(''),
  cp: z.string().optional().default(''),
  fecha_nac: z.string().optional().default(''),
  genero: z.string().optional().default(''),
  categoria: z.string().optional().default(''),
  vend_id: z.string().optional().nullable(),
  tipo_doc: z.string().optional().default(''),
  web_id: z.string().optional().default(''),
  puntos: z.number().int().optional().default(0),
});

const gastoSchema = z.object({
  nombre: z.string().min(1, 'Nombre requerido'),
  monto: z.number({message: 'Monto requerido'}).positive(),
  categoria_id: z.string().optional().nullable(),
  fecha: z.string().optional(),
  fecha_vencimiento: z.string().optional().nullable(),
  estado: z.string().optional().default('pagado'),
  metodo_pago: z.string().optional().default('transferencia'),
  suc_id: z.string().optional().nullable(),
  recurrente_id: z.string().optional().nullable(),
  nro_comprobante: z.string().optional().default(''),
  notas: z.string().optional().default(''),
  pagado_por: z.string().optional(),
  genera_egreso_caja: z.boolean().optional().default(false),
  fuente: z.string().optional().nullable(),
  cuenta_id: z.string().optional().nullable(),
});

const cajaAbrirSchema = z.object({
  suc_id: z.string().min(1, 'Sucursal requerida'),
  fondo_inicial: z.number().optional().default(0),
});

const cajaMovimientoSchema = z.object({
  tipo: z.enum(['ingreso', 'egreso', 'retiro']),
  concepto: z.string().min(1, 'Concepto requerido'),
  monto: z.number().positive('Monto debe ser positivo'),
  pago_metodo: z.string().optional().default('efectivo'),
  suc_id: z.string().optional(),
  nota: z.string().optional().default(''),
});

function validate(schema) {
  return (req, res, next) => {
    const result = schema.safeParse(req.body);
    if (!result.success) {
      const errors = result.error.flatten().fieldErrors;
      const first = Object.values(errors).flat()[0];
      return res.status(400).json({ error: first || 'Datos inválidos', detalles: errors });
    }
    req.body = result.data;
    next();
  };
}

module.exports = { validate, loginSchema, createUserSchema, changePasswordSchema, forgotPasswordSchema, resetPasswordSchema, webhookCreateSchema, superadminLoginSchema, twofaSetupSchema, twofaConfirmSchema, twofaVerifySchema, twofaDisableSchema, superadmin2faVerifySchema, ventaCreateSchema, productoSchema, clienteSchema, gastoSchema, cajaAbrirSchema, cajaMovimientoSchema };
