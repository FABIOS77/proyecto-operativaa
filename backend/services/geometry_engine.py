import pulp
import numpy as np
import pandas as pd
import io

class LinearProgrammingEngine:
    
    @staticmethod
    def solve_and_generate_geometry(objective, constraints, maximize=True):
        """
        Calcula la solución óptima y genera los datos geométricos para el gráfico.
        
        :param objective: Dict {'x': float, 'y': float} (Coeficientes de Z)
        :param constraints: Lista de Dicts [{'x': float, 'y': float, 'operator': '<=', 'rhs': float}]
        """
        
        # 1. RESOLVER MATEMÁTICAMENTE CON PULP (Para tener el 'ground truth')
        prob_type = pulp.LpMaximize if maximize else pulp.LpMinimize
        prob = pulp.LpProblem("Graphic_LP", prob_type)
        
        # Variables de decisión (x1, x2 >= 0 es estándar en método gráfico)
        x = pulp.LpVariable("x", lowBound=0)
        y = pulp.LpVariable("y", lowBound=0)
        
        # Función Objetivo
        prob += objective['x'] * x + objective['y'] * y, "Objective_Function"
        
        # Agregar Restricciones al modelo PuLP
        for i, c in enumerate(constraints):
            lhs = c['x'] * x + c['y'] * y
            rhs = c['rhs']
            if c['operator'] == '<=': prob += lhs <= rhs, f"C{i}"
            elif c['operator'] == '>=': prob += lhs >= rhs, f"C{i}"
            elif c['operator'] == '=': prob += lhs == rhs, f"C{i}"

        # Resolver
        prob.solve(pulp.PULP_CBC_CMD(msg=False))
        status = pulp.LpStatus[prob.status]
        
        optimal_point = None
        optimal_z = 0
        if status == 'Optimal':
            optimal_point = {'x': x.varValue, 'y': y.varValue}
            optimal_z = pulp.value(prob.objective)

        # 2. CÁLCULO DE GEOMETRÍA (Para dibujar la región factible)
        # Convertimos las restricciones en líneas de la forma Ax + By = C
        lines = []
        # Agregamos bordes de no negatividad (x=0, y=0) explícitamente para intersecciones
        lines.append({'x': 1, 'y': 0, 'rhs': 0, 'type': 'axis'}) # Eje Y
        lines.append({'x': 0, 'y': 1, 'rhs': 0, 'type': 'axis'}) # Eje X
        
        for c in constraints:
            lines.append(c)

        points = []
        
        # Encontrar intersecciones de cada par de líneas
        for i in range(len(lines)):
            for j in range(i + 1, len(lines)):
                l1 = lines[i]
                l2 = lines[j]
                
                # Sistema de ecuaciones:
                # l1['x']*x + l1['y']*y = l1['rhs']
                # l2['x']*x + l2['y']*y = l2['rhs']
                
                A = np.array([[l1['x'], l1['y']], [l2['x'], l2['y']]])
                B = np.array([l1['rhs'], l2['rhs']])
                
                try:
                    # Resolver sistema lineal
                    intersection = np.linalg.solve(A, B)
                    pt_x, pt_y = intersection[0], intersection[1]
                    
                    # Verificar si el punto satisface TODAS las restricciones (Región Factible)
                    if LinearProgrammingEngine._is_feasible(pt_x, pt_y, constraints):
                        # Evitar duplicados flotantes
                        is_duplicate = False
                        for p in points:
                            if np.isclose(p['x'], pt_x) and np.isclose(p['y'], pt_y):
                                is_duplicate = True
                                break
                        if not is_duplicate:
                            points.append({'x': float(pt_x), 'y': float(pt_y)})
                            
                except np.linalg.LinAlgError:
                    continue # Líneas paralelas, no hay intersección

        # Ordenar puntos para formar un polígono convexo (para que SVG lo dibuje bien)
        if len(points) > 2:
            points = LinearProgrammingEngine._sort_clockwise(points)

        return {
            "status": status,
            "optimal_solution": {
                "point": optimal_point,
                "z_value": optimal_z
            },
            "feasible_region": points, # Vértices del polígono
            "constraints_lines": constraints # Para dibujar las líneas infinitas
        }

    @staticmethod
    def _is_feasible(x, y, constraints):
        # Tolerancia para errores de punto flotante
        tol = 1e-5
        
        # Restricciones de no negatividad
        if x < -tol or y < -tol:
            return False
            
        for c in constraints:
            val = c['x'] * x + c['y'] * y
            if c['operator'] == '<=':
                if val > c['rhs'] + tol: return False
            elif c['operator'] == '>=':
                if val < c['rhs'] - tol: return False
            elif c['operator'] == '=':
                if not np.isclose(val, c['rhs']): return False
        return True

    @staticmethod
    def _sort_clockwise(points):
        # Calcular centroide
        center_x = sum(p['x'] for p in points) / len(points)
        center_y = sum(p['y'] for p in points) / len(points)
        
        # Ordenar por ángulo respecto al centroide
        def sort_key(p):
            return np.arctan2(p['y'] - center_y, p['x'] - center_x)
            
        return sorted(points, key=sort_key)

    @staticmethod
    def generate_excel_report(data):
        """Genera un reporte Excel en memoria"""
        output = io.BytesIO()
        writer = pd.ExcelWriter(output, engine='openpyxl')
        
        # Hoja 1: Resumen
        resumen = {
            'Estado': [data['status']],
            'Z Óptimo': [data['optimal_solution']['z_value']],
            'X1 (x) Óptimo': [data['optimal_solution']['point']['x']],
            'X2 (y) Óptimo': [data['optimal_solution']['point']['y']]
        }
        pd.DataFrame(resumen).to_excel(writer, sheet_name='Resultados', index=False)
        
        # Hoja 2: Vértices
        vertices = data['feasible_region']
        pd.DataFrame(vertices).to_excel(writer, sheet_name='Vértices Región Factible', index=False)
        
        writer.close()
        output.seek(0)
        return output