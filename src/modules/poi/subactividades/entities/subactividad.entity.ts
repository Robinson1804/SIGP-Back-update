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
import { ActividadEstado } from '../../actividades/enums/actividad-estado.enum';
import { Clasificacion } from '../../proyectos/enums/proyecto-estado.enum';

@Entity('subactividades', { schema: 'poi' })
export class Subactividad {
  @PrimaryGeneratedColumn()
  id: number;

  @Index()
  @Column({ name: 'actividad_padre_id' })
  actividadPadreId: number;

  @ManyToOne('Actividad', { nullable: false })
  @JoinColumn({ name: 'actividad_padre_id' })
  actividadPadre: any;

  @Column({ length: 20 })
  codigo: string;

  @Column({ length: 200 })
  nombre: string;

  @Column({ type: 'text', nullable: true })
  descripcion: string;

  // Heredada del padre
  @Column({ name: 'accion_estrategica_id', nullable: true })
  accionEstrategicaId: number;

  @ManyToOne('AccionEstrategica', { nullable: true })
  @JoinColumn({ name: 'accion_estrategica_id' })
  accionEstrategica: any;

  @Column({
    type: 'varchar',
    length: 50,
    nullable: true,
    enum: Clasificacion,
  })
  clasificacion: Clasificacion;

  // Metodología (siempre Kanban para subactividades)
  @Column({ name: 'metodo_gestion', length: 20, default: 'Kanban' })
  metodoGestion: string;

  // Stakeholders
  @Index()
  @Column({ name: 'coordinador_id', nullable: true })
  coordinadorId: number;

  @ManyToOne('Usuario', { nullable: true })
  @JoinColumn({ name: 'coordinador_id' })
  coordinador: any;

  @Index()
  @Column({ name: 'gestor_id', nullable: true })
  gestorId: number;

  @ManyToOne('Usuario', { nullable: true })
  @JoinColumn({ name: 'gestor_id' })
  gestor: any;

  // Financiero
  @Column({ length: 100, nullable: true })
  coordinacion: string;

  @Column({ name: 'areas_financieras', type: 'text', array: true, nullable: true })
  areasFinancieras: string[];

  @Column({ name: 'monto_anual', type: 'decimal', precision: 15, scale: 2, nullable: true })
  montoAnual: number;

  @Column({ type: 'integer', array: true, nullable: true })
  anios: number[];

  // Fechas
  @Column({ name: 'fecha_inicio', type: 'date', nullable: true })
  fechaInicio: Date;

  @Column({ name: 'fecha_fin', type: 'date', nullable: true })
  fechaFin: Date;

  // Estado
  @Index()
  @Column({
    type: 'varchar',
    length: 50,
    default: ActividadEstado.PENDIENTE,
    enum: ActividadEstado,
  })
  estado: ActividadEstado;

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
