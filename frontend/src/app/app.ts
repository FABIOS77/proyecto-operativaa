import { Component, OnInit, ChangeDetectorRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { HttpClientModule } from '@angular/common/http';
import { OptimizerService, Objective, Constraint, GraphicSolution, Point } from './services/optimizer.service';
import { 
  LucideAngularModule, 
  LUCIDE_ICONS, 
  LucideIconProvider, 
  Calculator, TrendingUp, Grip, Plus, Trash2, Info, RefreshCw, FileSpreadsheet, 
  CircleX, ArrowLeft, ArrowRight, X, Presentation, BookOpen, Eraser, Lightbulb
} from 'lucide-angular';
import { debounceTime, Subject, switchMap, tap, catchError, of } from 'rxjs';

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [CommonModule, FormsModule, HttpClientModule, LucideAngularModule],
  providers: [
    {
      provide: LUCIDE_ICONS,
      multi: true,
      useValue: new LucideIconProvider({
        Calculator, TrendingUp, Grip, Plus, Trash2, Info, RefreshCw, FileSpreadsheet, 
        'x-circle': CircleX, ArrowLeft, ArrowRight, X, Presentation, BookOpen, Eraser, Lightbulb
      })
    }
  ],
  templateUrl: './app.html',
  styleUrl: './app.css'
})
export class AppComponent implements OnInit {
  backendStatus = 'offline';
  loading = false;
  maximize = true;
  
  private solveTrigger = new Subject<void>();

  objective: Objective = { x: 0, y: 0 };
  constraints: Constraint[] = [];
  solution: GraphicSolution | null = null;

  isStepMode = false;
  currentStep = 0;
  totalSteps = 0;
  stepDescription = '';
  stepBusinessMeaning = '';
  
  isExampleActive = false;
  exampleContext = {
    title: '', story: '', x1Name: '', x2Name: '', objectiveName: '', constraintsDesc: [] as string[]
  };

  viewBox = "-1 -1 12 12";
  camX = 0; camY = 0; camWidth = 12; camHeight = 12;
  private isDragging = false;
  private lastMouseX = 0;
  private lastMouseY = 0;

  gridSize = 1;
  xTicks: number[] = [];
  yTicks: number[] = [];

  renderLines: any[] = [];
  objLine = { x1: 0, y1: 0, x2: 0, y2: 0 };

  constructor(
    private optimizerService: OptimizerService,
    private cdr: ChangeDetectorRef 
  ) {
    this.solveTrigger.pipe(
      debounceTime(300),
      tap(() => this.loading = true),
      switchMap(() => {
        // Validamos que haya restricciones y que tengan valores numéricos válidos
        if (this.constraints.length === 0) return of(null);
        return this.optimizerService.solveGraphic(this.objective, this.constraints, this.maximize)
          .pipe(catchError(err => {
            console.error("Error backend:", err);
            return of(null);
          }));
      })
    ).subscribe((res) => {
      this.loading = false;
      
      if (res) {
        // TRUCO: Usamos el spread operator {...res} para crear una NUEVA referencia de memoria.
        // Esto obliga a Angular a detectar que el objeto cambió y repintar el HTML (el recuadro).
        this.solution = { ...res };
        
        try { 
          this.autoFit(res); 
        } catch (e) { 
          console.warn("Error visual:", e); 
        }
      } else {
        this.solution = null;
      }
      
      // En la mayoría de casos no es necesario, pero lo dejamos por seguridad
      this.cdr.detectChanges(); 
    });
  }

  ngOnInit() {
    this.optimizerService.checkHealth().subscribe({
      next: () => this.backendStatus = 'online',
      error: () => this.backendStatus = 'offline'
    });
    this.clearAll();
  }

  // --- FUNCIÓN CLAVE PARA EVITAR QUE LOS INPUTS SE VUELVAN LOCOS ---
  trackByIndex(index: number, item: any): number {
    return index;
  }

  loadExample() {
    this.isExampleActive = true;
    this.maximize = true;
    this.objective = { x: 3, y: 5 };
    this.constraints = [
      { x: 1, y: 0, operator: '<=', rhs: 4 },
      { x: 0, y: 2, operator: '<=', rhs: 12 },
      { x: 3, y: 2, operator: '<=', rhs: 18 }
    ];
    this.exampleContext = {
      title: 'Caso de Estudio: Carpintería "El Roble"',
      story: 'Don José tiene una carpintería pequeña. Fabrica Sillas (X1) y Mesas (X2). Quiere saber cuántas fabricar de cada una para ganar la mayor cantidad de dinero posible, pero tiene recursos limitados: Sierras, Lijas y Barniz.',
      x1Name: 'Sillas',
      x2Name: 'Mesas',
      objectiveName: 'Cada Silla se vende con $3 de ganancia y cada Mesa con $5.',
      constraintsDesc: [
        'Solo tenemos 4 horas de uso de Sierra disponibles. Cada Silla consume 1 hora.',
        'Solo tenemos 12 hojas de Lija. Cada Mesa consume 2 hojas.',
        'El Barniz es escaso (18 litros). Las Sillas usan 3L y las Mesas 2L.'
      ]
    };
    this.executeSolve();
  }

  clearAll() {
    this.isExampleActive = false;
    this.isStepMode = false;
    this.objective = { x: 0, y: 0 };
    this.constraints = [];
    this.solution = null;
    this.renderLines = []; 
    this.objLine = { x1: 0, y1: 0, x2: 0, y2: 0 };
    this.camX = -1; this.camY = -1; this.camWidth = 12; this.camHeight = 12;
    this.updateViewBoxStr();
    this.generateTicks();
    // No llamamos a detectChanges aquí, dejamos que Angular lo haga
  }

  // --- MODO PASO A PASO ---
  startStepMode() {
    if (!this.solution) return;
    this.isStepMode = true;
    this.currentStep = 1;
    this.totalSteps = this.constraints.length + 3; 
    this.updateStep();
    this.autoFit(this.solution);
  }

  nextStep() {
    if (this.currentStep < this.totalSteps) {
      this.currentStep++;
      this.updateStep();
    } else {
      this.exitStepMode();
    }
  }

  prevStep() {
    if (this.currentStep > 1) {
      this.currentStep--;
      this.updateStep();
    }
  }

  exitStepMode() {
    this.isStepMode = false;
    this.currentStep = 0;
  }

  updateStep() {
    this.stepBusinessMeaning = ''; 
    if (this.currentStep <= this.constraints.length) {
      const idx = this.currentStep - 1;
      const c = this.constraints[idx];
      this.stepDescription = `Graficamos la restricción R${idx+1}: ${c.x}x₁ + ${c.y}x₂ ${c.operator} ${c.rhs}`;
      if (this.isExampleActive && this.exampleContext.constraintsDesc[idx]) {
        this.stepBusinessMeaning = `Interpretación: ${this.exampleContext.constraintsDesc[idx]} Esta línea marca el límite de ese recurso.`;
      } else {
        this.stepBusinessMeaning = "Esta línea divide el plano. La solución debe estar del lado que cumple la desigualdad.";
      }
    } else if (this.currentStep === this.constraints.length + 1) {
      this.stepDescription = `Identificamos la Región Factible (área coloreada).`;
      this.stepBusinessMeaning = "Esta zona verde representa todas las combinaciones posibles de producción que respetan TODOS nuestros límites de recursos a la vez.";
    } else if (this.currentStep === this.constraints.length + 2) {
      this.stepDescription = `Graficamos la Función Objetivo (Z).`;
      this.stepBusinessMeaning = "Imagina que esta línea roja es una 'regla' que deslizamos buscando el valor más alto. Queremos llevarla lo más lejos posible del origen sin salirnos de la zona verde.";
    } else {
      const zVal = this.solution?.optimal_solution?.z_value;
      this.stepDescription = `Solución Óptima Encontrada: Z = ${zVal}`;
      if (this.isExampleActive) {
        const x1Val = this.solution?.optimal_solution?.point?.x;
        const x2Val = this.solution?.optimal_solution?.point?.y;
        this.stepBusinessMeaning = `¡Éxito! Para obtener la ganancia máxima de $${zVal}, Don José debe fabricar ${x1Val} ${this.exampleContext.x1Name} y ${x2Val} ${this.exampleContext.x2Name}.`;
      } else {
        this.stepBusinessMeaning = "Este vértice es el punto más lejano que toca la función objetivo dentro de la región factible. Es matemáticamente la mejor decisión.";
      }
    }
  }

  shouldShowConstraint(index: number): boolean {
    if (!this.isStepMode) return true;
    return (index + 1) <= this.currentStep;
  }

  shouldShowFeasible(): boolean {
    if (!this.isStepMode) return true;
    return this.currentStep > this.constraints.length;
  }

  shouldShowObjective(): boolean {
    if (!this.isStepMode) return true;
    return this.currentStep > this.constraints.length + 1;
  }

  shouldShowOptimal(): boolean {
    if (!this.isStepMode) return true;
    return this.currentStep > this.constraints.length + 2;
  }

  // --- INTERACCIONES ---
  onWheel(event: WheelEvent) {
    event.preventDefault();
    const zoomFactor = 1.1;
    const direction = event.deltaY > 0 ? 1 : -1;
    if (direction > 0) { this.camWidth *= zoomFactor; this.camHeight *= zoomFactor; } 
    else { this.camWidth /= zoomFactor; this.camHeight /= zoomFactor; }
    this.updateViewBoxStr();
    this.generateTicks();
  }

  onMouseDown(event: MouseEvent) {
    this.isDragging = true;
    this.lastMouseX = event.clientX;
    this.lastMouseY = event.clientY;
  }

  onMouseMove(event: MouseEvent) {
    if (!this.isDragging) return;
    event.preventDefault();
    const sensitivity = this.camWidth / 800; 
    const dx = (event.clientX - this.lastMouseX) * sensitivity;
    const dy = (event.clientY - this.lastMouseY) * sensitivity;
    this.camX -= dx;
    this.camY += dy; 
    this.lastMouseX = event.clientX;
    this.lastMouseY = event.clientY;
    this.updateViewBoxStr();
    this.generateTicks();
  }

  onMouseUp() { this.isDragging = false; }

  resetCamera() {
    if (this.solution) this.autoFit(this.solution);
    else { this.camX = -1; this.camY = -1; this.camWidth = 12; this.camHeight = 12; this.updateViewBoxStr(); }
  }

  updateViewBoxStr() {
    this.viewBox = `${this.camX} ${this.camY} ${this.camWidth} ${this.camHeight}`;
  }

  triggerSolve() {
    this.solveTrigger.next();
  }

  setMaximize(val: boolean) {
    this.maximize = val;
    this.executeSolve();
  }

  addConstraint() {
    this.constraints.push({ x: 1, y: 1, operator: '<=', rhs: 10 });
    this.executeSolve();
  }

  removeConstraint(index: number) {
    this.constraints.splice(index, 1);
    this.executeSolve();
  }

  executeSolve() {
    this.solveTrigger.next();
  }

  downloadReport() {
    this.optimizerService.exportReport(this.objective, this.constraints, this.maximize)
      .subscribe((blob: Blob) => {
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `Simplex_Report_${new Date().getTime()}.xlsx`;
        a.click();
        window.URL.revokeObjectURL(url);
      });
  }

  autoFit(data: GraphicSolution) {
    if (!data.feasible_region || data.feasible_region.length === 0) return;
    const xs = data.feasible_region.map(p => p.x);
    const ys = data.feasible_region.map(p => p.y);
    if (xs.some(x => !isFinite(x)) || ys.some(y => !isFinite(y))) return;

    const minX = Math.min(0, ...xs); const maxX = Math.max(...xs);
    const minY = Math.min(0, ...ys); const maxY = Math.max(...ys);
    const paddingX = (maxX - minX) * 0.2 || 5;
    const paddingY = (maxY - minY) * 0.2 || 5;

    this.camX = minX - paddingX;
    this.camY = minY - paddingY;
    this.camWidth = (maxX + paddingX) - this.camX;
    this.camHeight = (maxY + paddingY) - this.camY;

    this.updateViewBoxStr();
    this.generateTicks();
    this.renderLines = data.constraints_lines.map(c => this.calculateLineSegment(c));
    if (data.optimal_solution?.point) this.calculateObjectiveLine(data.optimal_solution.point);
  }

  generateTicks() {
    const range = Math.max(this.camWidth, this.camHeight);
    if (range <= 5) this.gridSize = 0.5;
    else if (range <= 10) this.gridSize = 1;
    else if (range <= 25) this.gridSize = 2;
    else if (range <= 50) this.gridSize = 5;
    else this.gridSize = 10;

    this.xTicks = [];
    const startX = Math.floor(this.camX / this.gridSize) * this.gridSize;
    const endX = this.camX + this.camWidth;
    for (let x = startX; x <= endX; x += this.gridSize) this.xTicks.push(x);

    this.yTicks = [];
    const startY = Math.floor(this.camY / this.gridSize) * this.gridSize;
    const endY = this.camY + this.camHeight;
    for (let y = startY; y <= endY; y += this.gridSize) this.yTicks.push(y);
  }

  calculateLineSegment(c: Constraint) {
    const bigMin = -1000; const bigMax = 1000; const tol = 1e-5;
    if (Math.abs(c.y) < tol) { const x = c.rhs / (c.x || 1); return { x1: x, y1: bigMin, x2: x, y2: bigMax }; }
    if (Math.abs(c.x) < tol) { const y = c.rhs / (c.y || 1); return { x1: bigMin, y1: y, x2: bigMax, y2: y }; }
    const y1 = (c.rhs - c.x * bigMin) / c.y;
    const y2 = (c.rhs - c.x * bigMax) / c.y;
    return { x1: bigMin, y1: y1, x2: bigMax, y2: y2 };
  }

  calculateObjectiveLine(pt: Point) {
    const bigMin = -1000; const bigMax = 1000;
    if (Math.abs(this.objective.y) < 1e-5) { this.objLine = { x1: pt.x, y1: bigMin, x2: pt.x, y2: bigMax }; } 
    else {
       const m = -this.objective.x / this.objective.y;
       const y1 = pt.y + m * (bigMin - pt.x);
       const y2 = pt.y + m * (bigMax - pt.x);
       this.objLine = { x1: bigMin, y1: y1, x2: bigMax, y2: y2 };
    }
  }

  getPolygonPoints(): string {
    return this.solution?.feasible_region?.map(p => `${p.x},${p.y}`).join(' ') || '';
  }
}