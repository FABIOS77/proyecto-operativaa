import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';

export interface Objective {
    x: number; // Coeficiente X1
    y: number; // Coeficiente X2
}

export interface Constraint {
    x: number;
    y: number;
    operator: '<=' | '>=' | '=';
    rhs: number;
}

export interface Point {
    x: number;
    y: number;
}

export interface GraphicSolution {
    status: string;
    optimal_solution: {
        point: Point;
        z_value: number;
    };
    feasible_region: Point[];
    constraints_lines: any[];
}

@Injectable({
    providedIn: 'root'
})
export class OptimizerService {
    // Ajusta la URL si tu backend corre en otro puerto
    private apiUrl = 'http://127.0.0.1:5000/api';

    constructor(private http: HttpClient) { }

    checkHealth(): Observable<any> {
        return this.http.get(`${this.apiUrl}/health`);
    }

    solveGraphic(objective: Objective, constraints: Constraint[], maximize: boolean): Observable<GraphicSolution> {
        const payload = {
            objective,
            constraints,
            maximize
        };
        return this.http.post<GraphicSolution>(`${this.apiUrl}/solve-graphic`, payload);
    }

    exportReport(objective: Objective, constraints: Constraint[], maximize: boolean) {
        const payload = { objective, constraints, maximize };
        return this.http.post(`${this.apiUrl}/export-report`, payload, {
            responseType: 'blob' // Importante para descargar archivos binarios (Excel)
        });
    }
}