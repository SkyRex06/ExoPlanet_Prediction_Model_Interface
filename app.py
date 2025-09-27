from flask import Flask, request, jsonify, render_template, send_from_directory
import pandas as pd
import joblib
import numpy as np
import os

app = Flask(__name__, static_folder='static', template_folder='templates')

# Add CORS headers manually
@app.after_request
def after_request(response):
    response.headers.add('Access-Control-Allow-Origin', '*')
    response.headers.add('Access-Control-Allow-Headers', 'Content-Type,Authorization')
    response.headers.add('Access-Control-Allow-Methods', 'GET,PUT,POST,DELETE,OPTIONS')
    return response

# Load the model when the server starts
model_path = "rf_pipeline.pkl"
if os.path.exists(model_path):
    pipeline = joblib.load(model_path)
    print("✅ Model loaded successfully!")
else:
    print("❌ Model file not found!")
    pipeline = None

@app.route('/predict', methods=['POST', 'OPTIONS'])
def predict():
    if request.method == 'OPTIONS':
        return '', 200
    try:
        # Get the CSV data from the request
        csv_data = request.json.get('data')
        
        if not csv_data:
            return jsonify({'error': 'No data provided'}), 400
        
        # Convert to DataFrame
        df = pd.DataFrame(csv_data)
        
        # Ensure we have the required columns in the right order
        required_columns = [
            'koi_fpflag_nt', 'koi_fpflag_ss', 'koi_fpflag_co', 'koi_fpflag_ec',
            'koi_period', 'koi_impact', 'koi_duration', 'koi_depth',
            'koi_prad', 'koi_teq', 'koi_insol', 'koi_model_snr',
            'koi_steff', 'koi_slogg', 'koi_srad', 'koi_kepmag'
        ]
        
        # Reorder columns to match model expectations
        df_reordered = df[required_columns]
        
        # Make predictions
        if pipeline is None:
            return jsonify({'error': 'Model not loaded'}), 500
            
        predictions = pipeline.predict(df_reordered)
        probabilities = pipeline.predict_proba(df_reordered)
        
        # Format results
        results = []
        for i, (pred, prob) in enumerate(zip(predictions, probabilities)):
            results.append({
                'index': i + 1,
                'prediction': int(pred),
                'is_exoplanet': bool(pred == 1),
                'confidence': float(max(prob)),  # Maximum probability
                'exoplanet_probability': float(prob[1]) if len(prob) > 1 else float(prob[0]),
                'false_positive_probability': float(prob[0]) if len(prob) > 1 else float(prob[0])
            })
        
        return jsonify({
            'success': True,
            'predictions': results,
            'total_samples': len(results)
        })
        
    except Exception as e:
        return jsonify({'error': str(e)}), 500

@app.route('/health', methods=['GET'])
def health():
    return jsonify({
        'status': 'healthy',
        'model_loaded': pipeline is not None
    })


# Serve the main HTML interface
@app.route('/')
def index():
    return render_template('index.html')

if __name__ == '__main__':
    print("🚀 Starting Exoplanet Prediction Server...")
    print("📊 Model Status:", "✅ Loaded" if pipeline else "❌ Not Loaded")
    app.run(debug=True, host='0.0.0.0', port=5000)
