import {
  Entity,
  Column,
  PrimaryGeneratedColumn,
  CreateDateColumn,
  UpdateDateColumn,
  ManyToOne,
  JoinColumn,
  Index,
} from 'typeorm';
import { ActaTipo, ActaEstado, TipoReunion } from '../enums/acta.enum';

@Entity('actas', { schema: 'poi' })
export class Acta {
  @PrimaryGeneratedColumn()
  id: number;

  @Index()
  @Column({ name: 'proyecto_id' })
  proyectoId: number;

  @ManyToOne('Proyecto', 'actas')
  @JoinColumn({ name: 'proyecto_id' })
  proyecto: any;

  @Column({ length: 20 })
  codigo: string;

  @Column({ length: 200 })
  nombre: string;

  @Index()
  @Column({ type: 'varchar', length: 50, enum: ActaTipo })
  tipo: ActaTipo;

  @Column({ type: 'date' })
  fecha: Date;

  // Estado y aprobación
  @Index()
  @Column({
    type: 'varchar',
    length: 50,
    default: ActaEstado.PENDIENTE,
    enum: ActaEstado,
  })
  estado: ActaEstado;

  @Column({ name: 'archivo_url', length: 500, nullable: true })
  archivoUrl: string;

  // Campos de Acta de Reunión
  @Column({
    name: 'tipo_reunion',
    type: 'varchar',
    length: 50,
    nullable: true,
    enum: TipoReunion,
  })
  tipoReunion: TipoReunion;

  @Column({ name: 'fase_perteneciente', length: 100, nullable: true })
  fasePerteneciente: string;

  @Column({ name: 'hora_inicio', type: 'time', nullable: true })
  horaInicio: string;

  @Column({ name: 'hora_fin', type: 'time', nullable: true })
  horaFin: string;

  @Column({ type: 'jsonb', nullable: true })
  asistentes: any[];

  @Column({ type: 'jsonb', nullable: true })
  ausentes: any[];

  @Column({ type: 'jsonb', nullable: true })
  agenda: any[];

  @Column({ name: 'temas_desarrollados', type: 'jsonb', nullable: true })
  temasDesarrollados: any[];

  @Column({ type: 'jsonb', nullable: true })
  acuerdos: any[];

  @Column({ name: 'proximos_pasos', type: 'jsonb', nullable: true })
  proximosPasos: any[];

  @Column({ type: 'text', nullable: true })
  observaciones: string;

  // Campos de Acta de Constitución
  @Column({ name: 'objetivo_smart', type: 'text', nullable: true })
  objetivoSmart: string;

  @Column({ type: 'text', nullable: true })
  alcance: string;

  @Column({ name: 'fuera_de_alcance', type: 'text', nullable: true })
  fueraDeAlcance: string;

  @Column({ type: 'jsonb', nullable: true })
  entregables: any[];

  @Column({ type: 'jsonb', nullable: true })
  riesgos: any[];

  @Column({ name: 'presupuesto_estimado', type: 'decimal', precision: 15, scale: 2, nullable: true })
  presupuestoEstimado: number;

  // Aprobación
  @Column({ name: 'aprobado_por', nullable: true })
  aprobadoPor: number;

  @ManyToOne('Usuario', { nullable: true })
  @JoinColumn({ name: 'aprobado_por' })
  aprobador: any;

  @Column({ name: 'fecha_aprobacion', type: 'timestamp with time zone', nullable: true })
  fechaAprobacion: Date;

  // Auditoría
  @Index()
  @Column({ default: true })
  activo: boolean;

  @Column({ name: 'created_by', type: 'int', nullable: true })
  createdBy: number | null | undefined;

  @Column({ name: 'updated_by', type: 'int', nullable: true })
  updatedBy: number | null | undefined;

  @CreateDateColumn({ name: 'created_at', type: 'timestamp with time zone' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamp with time zone' })
  updatedAt: Date;
}
