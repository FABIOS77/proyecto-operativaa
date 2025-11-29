from flask import Flask, jsonify, request, send_file
from flask_cors import CORS
from services.geometry_engine import LinearProgrammingEngine
import datetime

app = Flask(__name__)
CORS(app, resources={r"/api/*": {"origins": "*"}})

@app.route('/api/health', methods=['GET'])
def health_check():
    return jsonify({
        "status": "online",
        "mode": "SimplexVision Graphic Engine",
        "engine": "NumPy + PuLP"
    })

@app.route('/api/solve-graphic', methods=['POST'])
def solve_graphic():
    try:
        data = request.json
        result = LinearProgrammingEngine.solve_and_generate_geometry(
            data['objective'],
            data['constraints'],
            data.get('maximize', True)
        )
        return jsonify(result)

    except Exception as e:
        print(f"Error: {e}")
        return jsonify({"error": str(e)}), 500

@app.route('/api/export-report', methods=['POST'])
def export_report():
    try:
        data = request.json
        
        result = LinearProgrammingEngine.solve_and_generate_geometry(
            data['objective'],
            data['constraints'],
            data.get('maximize', True)
        )
        
        excel_file = LinearProgrammingEngine.generate_excel_report(
            result,
            data['objective'],
            data['constraints'],
            data.get('maximize', True)
        )
        
        filename = f"SimplexVision_Report_{datetime.datetime.now().strftime('%Y%m%d_%H%M')}.xlsx"
        
        return send_file(
            excel_file,
            mimetype='application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
            as_attachment=True,
            download_name=filename
        )

    except Exception as e:
        print(f"Error generando reporte: {e}")
        return jsonify({"error": str(e)}), 500

if __name__ == '__main__':
    app.run(debug=True, port=5000)