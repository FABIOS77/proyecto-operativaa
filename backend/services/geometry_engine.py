import pulp
import numpy as np
import pandas as pd
import io
import datetime

class LinearProgrammingEngine:
    
    @staticmethod
    def solve_and_generate_geometry(objective, constraints, maximize=True):
        """
        Calcula la solución óptima y genera los datos geométricos para el gráfico.
        """
        # 1. RESOLVER MATEMÁTICAMENTE CON PULP
        prob_type = pulp.LpMaximize if maximize else pulp.LpMinimize
        prob = pulp.LpProblem("Graphic_LP", prob_type)
        
        x = pulp.LpVariable("x", lowBound=0)
        y = pulp.LpVariable("y", lowBound=0)
        
        # Función Objetivo
        prob += objective['x'] * x + objective['y'] * y, "Objective_Function"
        
        # Restricciones
        for i, c in enumerate(constraints):
            lhs = c['x'] * x + c['y'] * y
            rhs = c['rhs']
            if c['operator'] == '<=': prob += lhs <= rhs, f"C{i}"
            elif c['operator'] == '>=': prob += lhs >= rhs, f"C{i}"
            elif c['operator'] == '=': prob += lhs == rhs, f"C{i}"

        # Solver
        prob.solve(pulp.PULP_CBC_CMD(msg=False))
        status = pulp.LpStatus[prob.status]
        
        optimal_point = None
        optimal_z = 0
        if status == 'Optimal':
            optimal_point = {'x': x.varValue, 'y': y.varValue}
            optimal_z = pulp.value(prob.objective)

        # 2. CÁLCULO DE GEOMETRÍA (Intersecciones)
        lines = []
        # Bordes de no negatividad
        lines.append({'x': 1, 'y': 0, 'rhs': 0, 'type': 'axis'}) # x=0
        lines.append({'x': 0, 'y': 1, 'rhs': 0, 'type': 'axis'}) # y=0
        
        for c in constraints:
            lines.append(c)

        points = []
        
        # Encontrar intersecciones
        for i in range(len(lines)):
            for j in range(i + 1, len(lines)):
                l1 = lines[i]
                l2 = lines[j]
                
                A = np.array([[l1['x'], l1['y']], [l2['x'], l2['y']]])
                B = np.array([l1['rhs'], l2['rhs']])
                
                try:
                    intersection = np.linalg.solve(A, B)
                    pt_x, pt_y = intersection[0], intersection[1]
                    
                    if LinearProgrammingEngine._is_feasible(pt_x, pt_y, constraints):
                        # Evitar duplicados
                        is_duplicate = False
                        for p in points:
                            if np.isclose(p['x'], pt_x) and np.isclose(p['y'], pt_y):
                                is_duplicate = True
                                break
                        if not is_duplicate:
                            points.append({'x': float(pt_x), 'y': float(pt_y)})
                            
                except np.linalg.LinAlgError:
                    continue 

        # Ordenar vértices para el polígono SVG
        if len(points) > 2:
            points = LinearProgrammingEngine._sort_clockwise(points)

        return {
            "status": status,
            "optimal_solution": {
                "point": optimal_point,
                "z_value": optimal_z
            },
            "feasible_region": points,
            "constraints_lines": constraints
        }

    @staticmethod
    def _is_feasible(x, y, constraints):
        tol = 1e-5
        if x < -tol or y < -tol: return False
            
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
        center_x = sum(p['x'] for p in points) / len(points)
        center_y = sum(p['y'] for p in points) / len(points)
        def sort_key(p): return np.arctan2(p['y'] - center_y, p['x'] - center_x)
        return sorted(points, key=sort_key)

    @staticmethod
    def generate_excel_report(result_data, objective, constraints, maximize):
        """
        Genera un reporte Excel profesional con 3 hojas: 
        Resumen, Planteamiento y Holguras.
        """
        output = io.BytesIO()
        writer = pd.ExcelWriter(output, engine='openpyxl')
        
        # --- HOJA 1: RESUMEN EJECUTIVO ---
        opt_point = result_data['optimal_solution']['point']
        opt_x = opt_point['x'] if opt_point else 0
        opt_y = opt_point['y'] if opt_point else 0
        opt_z = result_data['optimal_solution']['z_value']
        
        df_resumen = pd.DataFrame([
            ['Estado del Problema', result_data['status']],
            ['Objetivo', 'Maximizar' if maximize else 'Minimizar'],
            ['Valor Óptimo (Z)', opt_z],
            ['Variable X1', opt_x],
            ['Variable X2', opt_y],
            ['Fecha de Reporte', datetime.datetime.now().strftime("%Y-%m-%d %H:%M")]
        ], columns=['Métrica', 'Valor'])
        
        df_resumen.to_excel(writer, sheet_name='Resumen', index=False)
        
        # --- HOJA 2: PLANTEAMIENTO ---
        # Contexto del problema original
        df_obj = pd.DataFrame([{
            'Coeficiente X1': objective['x'],
            'Coeficiente X2': objective['y'],
            'Dirección': 'MAX' if maximize else 'MIN'
        }])
        df_obj.to_excel(writer, sheet_name='Planteamiento', startrow=0, index=False)
        
        df_constraints = pd.DataFrame(constraints)
        # Renombrar columnas para que sean legibles en el Excel
        if not df_constraints.empty:
            df_constraints = df_constraints.rename(columns={
                'x': 'Coef X1', 
                'y': 'Coef X2', 
                'operator': 'Signo', 
                'rhs': 'Límite (RHS)'
            })
            df_constraints.to_excel(writer, sheet_name='Planteamiento', startrow=4, index=False)

        # --- HOJA 3: ANÁLISIS DE HOLGURAS (SLACKS) ---
        analysis_data = []
        if opt_point:
            for i, c in enumerate(constraints):
                # Uso real: ax + by
                uso_real = c['x'] * opt_x + c['y'] * opt_y
                limite = c['rhs']
                
                # Holgura: Diferencia absoluta
                holgura = abs(limite - uso_real)
                
                # Estado: Si holgura es ~0, es una restricción activa (limitante)
                estado = "ACTIVA (Limitante)" if holgura < 1e-5 else "INACTIVA (Con Holgura)"
                
                analysis_data.append({
                    'Restricción': f"#{i+1}",
                    'Uso Real de Recurso': uso_real,
                    'Operador': c['operator'],
                    'Límite Disponible': limite,
                    'Holgura / Excedente': holgura,
                    'Estado': estado
                })
        
        if analysis_data:
            df_analysis = pd.DataFrame(analysis_data)
            df_analysis.to_excel(writer, sheet_name='Análisis Holguras', index=False)
        
        writer.close()
        output.seek(0)
        return output