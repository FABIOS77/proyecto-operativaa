import { Component, OnInit, ChangeDetectorRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { HttpClientModule } from '@angular/common/http';
import { OptimizerService, Objective, Constraint, GraphicSolution, Point } from './services/optimizer.service';
import { LucideAngularModule } from 'lucide-angular';
import { retry, finalize, debounceTime, Subject } from 'rxjs';

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [CommonModule, FormsModule, HttpClientModule, LucideAngularModule],
  templateUrl: './app.html',
  styleUrl: './app.css'
})
export class AppComponent implements OnInit {
  backendStatus = 'offline';
  loading = false;
  maximize = true;
  
  private solveTrigger = new Subject<void>();

  objective: Objective = { x: 3, y: 5 };
  
  constraints: Constraint[] = [
    { x: 1, y: 0, operator: '<=', rhs: 4 },
    { x: 0, y: 2, operator: '<=', rhs: 12 },
    { x: 3, y: 2, operator: '<=', rhs: 18 }
  ];

  solution: GraphicSolution | null = null;

  // --- LÓGICA DE CÁMARA (PAN & ZOOM) ---
  viewBox = "-1 -1 12 12";
  
  // ¡CORRECCIÓN!: Estas variables deben ser PÚBLICAS para que el HTML las lea.
  // Quitamos la palabra 'private'.
  camX = 0;
  camY = 0;
  camWidth = 12;
  camHeight = 12;
  
  private isDragging = false;
  private lastMouseX = 0;
  private lastMouseY = 0;

  // Grilla
  gridSize = 1;
  xTicks: number[] = [];
  yTicks: number[] = [];

  // Objetos de Renderizado
  renderLines: any[] = [];
  objLine = { x1: 0, y1: 0, x2: 0, y2: 0 };

  constructor(
    private optimizerService: OptimizerService,
    private cdr: ChangeDetectorRef 
  ) {
    this.solveTrigger.pipe(debounceTime(300)).subscribe(() => {
      this.executeSolve();
    });
  }

  ngOnInit() {
    this.optimizerService.checkHealth().subscribe({
      next: () => this.backendStatus = 'online',
      error: () => this.backendStatus = 'offline'
    });
    
    // Ejecutar inmediatamente. 
    // Usamos setTimeout(..., 0) para moverlo al final de la cola de ejecución 
    // y asegurar que la vista ya esté lista para recibir datos.
    setTimeout(() => this.executeSolve(), 0);
  }

  // --- INTERACCIÓN CON EL GRÁFICO (MOUSE) ---

  onWheel(event: WheelEvent) {
    event.preventDefault();
    const zoomFactor = 1.1;
    const direction = event.deltaY > 0 ? 1 : -1;
    
    if (direction > 0) {
      this.camWidth *= zoomFactor;
      this.camHeight *= zoomFactor;
    } else {
      this.camWidth /= zoomFactor;
      this.camHeight /= zoomFactor;
    }
    
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

  onMouseUp() {
    this.isDragging = false;
  }

  resetCamera() {
    if (this.solution) {
      this.autoFit(this.solution);
    } else {
      this.camX = -1; this.camY = -1;
      this.camWidth = 12; this.camHeight = 12;
      this.updateViewBoxStr();
    }
  }

  updateViewBoxStr() {
    this.viewBox = `${this.camX} ${this.camY} ${this.camWidth} ${this.camHeight}`;
  }

  // --- LÓGICA DE NEGOCIO ---

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
    if (this.constraints.length === 0) return;
    this.loading = true;
    
    this.optimizerService.solveGraphic(this.objective, this.constraints, this.maximize)
      .pipe(
        retry(1),
        finalize(() => {
          this.loading = false;
          // Forzar chequeo final para quitar spinner
          this.cdr.detectChanges(); 
        })
      )
      .subscribe({
        next: (res) => {
          this.solution = res;
          try {
            this.autoFit(res); 
            // ¡IMPORTANTE! Forzamos la actualización de la vista AQUÍ MISMO
            // Esto evita que tengas que mover el mouse para ver los cambios.
            this.cdr.detectChanges(); 
          } catch (e) {
            console.warn("Error visual:", e);
          }
        },
        error: (err) => console.error("Error backend:", err)
      });
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

  // --- MOTOR GRÁFICO ---

  autoFit(data: GraphicSolution) {
    if (!data.feasible_region || data.feasible_region.length === 0) return;

    const xs = data.feasible_region.map(p => p.x);
    const ys = data.feasible_region.map(p => p.y);
    
    if (xs.some(x => !isFinite(x)) || ys.some(y => !isFinite(y))) return;

    const minX = Math.min(0, ...xs);
    const maxX = Math.max(...xs);
    const minY = Math.min(0, ...ys);
    const maxY = Math.max(...ys);

    const paddingX = (maxX - minX) * 0.2 || 5;
    const paddingY = (maxY - minY) * 0.2 || 5;

    this.camX = minX - paddingX;
    this.camY = minY - paddingY;
    this.camWidth = (maxX + paddingX) - this.camX;
    this.camHeight = (maxY + paddingY) - this.camY;

    this.updateViewBoxStr();
    this.generateTicks();
    
    this.renderLines = data.constraints_lines.map(c => this.calculateLineSegment(c));
    
    if (data.optimal_solution?.point) {
       this.calculateObjectiveLine(data.optimal_solution.point);
    }
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
    
    for (let x = startX; x <= endX; x += this.gridSize) {
      this.xTicks.push(x);
    }

    this.yTicks = [];
    const startY = Math.floor(this.camY / this.gridSize) * this.gridSize;
    const endY = this.camY + this.camHeight;

    for (let y = startY; y <= endY; y += this.gridSize) {
      this.yTicks.push(y);
    }
  }

  calculateLineSegment(c: Constraint) {
    const bigMin = -1000;
    const bigMax = 1000;
    const tol = 1e-5;

    if (Math.abs(c.y) < tol) {
      const x = c.rhs / (c.x || 1);
      return { x1: x, y1: bigMin, x2: x, y2: bigMax };
    }
    if (Math.abs(c.x) < tol) {
      const y = c.rhs / (c.y || 1);
      return { x1: bigMin, y1: y, x2: bigMax, y2: y };
    }
    
    const y1 = (c.rhs - c.x * bigMin) / c.y;
    const y2 = (c.rhs - c.x * bigMax) / c.y;
    return { x1: bigMin, y1: y1, x2: bigMax, y2: y2 };
  }

  calculateObjectiveLine(pt: Point) {
    const bigMin = -1000;
    const bigMax = 1000;
    
    if (Math.abs(this.objective.y) < 1e-5) {
       this.objLine = { x1: pt.x, y1: bigMin, x2: pt.x, y2: bigMax };
    } else {
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