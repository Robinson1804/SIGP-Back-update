import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  ManyToOne,
  OneToMany,
  JoinColumn,
  CreateDateColumn,
  UpdateDateColumn,
  Index,
} from 'typeorm';

@Entity({ schema: 'rrhh', name: 'divisiones' })
export class Division {
  @PrimaryGeneratedColumn()
  id: number;

  @Index()
  @Column({ length: 20, unique: true })
  codigo: string;

  @Column({ length: 150 })
  nombre: string;

  @Column({ type: 'text', nullable: true })
  descripcion: string;

  // Jerarquía: self-reference
  @Column({ name: 'division_padre_id', nullable: true })
  divisionPadreId: number;

  @ManyToOne(() => Division, (division) => division.hijos, { nullable: true })
  @JoinColumn({ name: 'division_padre_id' })
  divisionPadre: Division;

  @OneToMany(() => Division, (division) => division.divisionPadre)
  hijos: Division[];

  // Jefe de división (referencia a Personal)
  @Column({ name: 'jefe_id', nullable: true })
  jefeId: number;

  @ManyToOne('Personal', { nullable: true })
  @JoinColumn({ name: 'jefe_id' })
  jefe: any;

  // Relación inversa con Personal
  @OneToMany('Personal', 'division')
  personal: any[];

  @Index()
  @Column({ default: true })
  activo: boolean;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;

  @Column({ name: 'created_by', type: 'int', nullable: true })
  createdBy: number | null | undefined;

  @Column({ name: 'updated_by', type: 'int', nullable: true })
  updatedBy: number | null | undefined;
}
