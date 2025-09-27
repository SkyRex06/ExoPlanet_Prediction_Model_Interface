class ExoplanetPredictor {
    constructor() {
        this.apiUrl = '/predict';
        this.healthUrl = '/health';
        this.modelLoaded = false;
        this.initializeEventListeners();
        this.checkModelStatus();
    }

    initializeEventListeners() {
        const uploadArea = document.getElementById('uploadArea');
        const fileInput = document.getElementById('fileInput');
        const predictBtn = document.getElementById('predictBtn');

        // Click to upload
        uploadArea.addEventListener('click', () => {
            fileInput.click();
        });

        // File input change
        fileInput.addEventListener('change', (e) => {
            this.handleFileSelect(e.target.files[0]);
        });

        // Drag and drop
        uploadArea.addEventListener('dragover', (e) => {
            e.preventDefault();
            uploadArea.classList.add('dragover');
        });

        uploadArea.addEventListener('dragleave', () => {
            uploadArea.classList.remove('dragover');
        });

        uploadArea.addEventListener('drop', (e) => {
            e.preventDefault();
            uploadArea.classList.remove('dragover');
            const file = e.dataTransfer.files[0];
            if (file && file.type === 'text/csv') {
                this.handleFileSelect(file);
            } else {
                this.showError('Please select a valid CSV file.');
            }
        });

        // Predict button
        predictBtn.addEventListener('click', () => {
            this.predictExoplanets();
        });
    }

    async checkModelStatus() {
        try {
            const response = await fetch(this.healthUrl);
            const data = await response.json();
            this.modelLoaded = data.model_loaded;
            
            if (this.modelLoaded) {
                console.log('✅ Model loaded and ready for predictions');
                this.showModelStatus('✅ Model loaded successfully', 'success');
            } else {
                console.log('❌ Model not loaded');
                this.showModelStatus('❌ Model not loaded. Please start the Python server.', 'error');
            }
        } catch (error) {
            console.log('❌ Cannot connect to model server');
            this.showModelStatus('❌ Cannot connect to model server. Please start the Python server with: python app.py', 'error');
        }
    }

    showModelStatus(message, type) {
        // Remove existing status if any
        const existingStatus = document.getElementById('modelStatus');
        if (existingStatus) {
            existingStatus.remove();
        }

        const statusDiv = document.createElement('div');
        statusDiv.id = 'modelStatus';
        statusDiv.style.cssText = `
            padding: 10px;
            margin: 10px 0;
            border-radius: 5px;
            font-weight: bold;
            ${type === 'success' ? 'background: #e8f5e8; color: #2e7d32; border-left: 4px solid #4CAF50;' : 'background: #ffebee; color: #c62828; border-left: 4px solid #f44336;'}
        `;
        statusDiv.textContent = message;
        
        const uploadSection = document.querySelector('.upload-section');
        uploadSection.insertBefore(statusDiv, uploadSection.firstChild);
    }

    handleFileSelect(file) {
        if (!file) return;

        if (file.type !== 'text/csv') {
            this.showError('Please select a CSV file.');
            return;
        }

        this.selectedFile = file;
        this.displayFileInfo(file);
    }

    displayFileInfo(file) {
        const fileInfo = document.getElementById('fileInfo');
        const fileName = document.getElementById('fileName');
        const fileSize = document.getElementById('fileSize');

        fileName.textContent = file.name;
        fileSize.textContent = `Size: ${(file.size / 1024).toFixed(2)} KB`;
        fileInfo.style.display = 'block';
    }

    async predictExoplanets() {
        if (!this.selectedFile) {
            this.showError('Please select a file first.');
            return;
        }

        const predictBtn = document.getElementById('predictBtn');
        const loading = document.getElementById('loading');
        const resultsSection = document.getElementById('resultsSection');
        const resultsContainer = document.getElementById('resultsContainer');

        // Show loading state
        predictBtn.disabled = true;
        loading.style.display = 'block';
        resultsSection.style.display = 'block';
        resultsContainer.innerHTML = '';

        try {
            // Read CSV file
            const csvData = await this.readCSVFile(this.selectedFile);
            
            // Parse CSV data (this automatically reorders columns)
            const parsedData = this.parseCSV(csvData);
            
            if (parsedData.length === 0) {
                throw new Error('No data found in CSV file.');
            }

            // Validate CSV format
            this.validateCSVFormat(parsedData[0]);

            // Get predictions from API
            const predictions = await this.getPredictionsFromAPI(parsedData);
            
            // Display results
            this.displayResults(predictions);

        } catch (error) {
            console.error('Error:', error);
            this.showError(`Error processing file: ${error.message}`);
        } finally {
            // Hide loading state
            predictBtn.disabled = false;
            loading.style.display = 'none';
        }
    }

    readCSVFile(file) {
        return new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = (e) => resolve(e.target.result);
            reader.onerror = () => reject(new Error('Failed to read file'));
            reader.readAsText(file);
        });
    }

    parseCSV(csvText) {
        const lines = csvText.trim().split('\n');
        const headers = lines[0].split(',').map(h => h.trim().replace(/"/g, '')); // Remove quotes if present
        
        // Define the required order for the model
        const requiredOrder = [
            'koi_fpflag_nt', 'koi_fpflag_ss', 'koi_fpflag_co', 'koi_fpflag_ec',
            'koi_period', 'koi_impact', 'koi_duration', 'koi_depth',
            'koi_prad', 'koi_teq', 'koi_insol', 'koi_model_snr',
            'koi_steff', 'koi_slogg', 'koi_srad', 'koi_kepmag'
        ];
        
        // Check for ground truth columns
        const groundTruthColumns = ['is_exoplanet', 'exoplanet', 'label', 'target'];
        const foundGroundTruth = groundTruthColumns.find(col => headers.includes(col));
        
        const data = [];
        for (let i = 1; i < lines.length; i++) {
            const values = lines[i].split(',').map(v => v.trim().replace(/"/g, ''));
            if (values.length === headers.length) {
                const row = {};
                headers.forEach((header, index) => {
                    row[header] = parseFloat(values[index]) || 0;
                });
                
                // Reorder the row to match model format
                const reorderedRow = this.reorderRow(row, requiredOrder, foundGroundTruth);
                data.push(reorderedRow);
            }
        }
        
        return data;
    }
    
    reorderRow(row, requiredOrder, groundTruthColumn) {
        const reorderedRow = {};
        
        // Add columns in the required order
        requiredOrder.forEach(column => {
            if (column in row) {
                reorderedRow[column] = row[column];
            } else {
                console.warn(`Missing required column: ${column}`);
                reorderedRow[column] = 0; // Default value for missing columns
            }
        });
        
        // Add ground truth column if present
        if (groundTruthColumn && groundTruthColumn in row) {
            reorderedRow[groundTruthColumn] = row[groundTruthColumn];
        }
        
        return reorderedRow;
    }

    validateCSVFormat(firstRow) {
        const requiredColumns = [
            'koi_fpflag_nt', 'koi_fpflag_ss', 'koi_fpflag_co', 'koi_fpflag_ec',
            'koi_period', 'koi_impact', 'koi_duration', 'koi_depth',
            'koi_prad', 'koi_teq', 'koi_insol', 'koi_model_snr',
            'koi_steff', 'koi_slogg', 'koi_srad', 'koi_kepmag'
        ];

        const missingColumns = requiredColumns.filter(col => !(col in firstRow));
        
        if (missingColumns.length > 0) {
            throw new Error(`Missing required columns: ${missingColumns.join(', ')}`);
        }
        
        // Check if ground truth column exists (0/1 format)
        this.hasGroundTruth = 'is_exoplanet' in firstRow || 'exoplanet' in firstRow || 'label' in firstRow || 'target' in firstRow;
        if (this.hasGroundTruth) {
            console.log('Ground truth labels detected - accuracy testing enabled');
        }
        
        // Log successful reordering
        console.log('✅ CSV columns automatically reordered to match model format');
        console.log('📋 Required columns found:', requiredColumns.length);
        console.log('🎯 Ground truth column:', this.hasGroundTruth ? 'Found' : 'Not found');
    }

    async getPredictionsFromAPI(data) {
        try {
            if (!this.modelLoaded) {
                throw new Error('Model not loaded. Please start the Python server.');
            }

            // Send data to local model
            const response = await fetch(this.apiUrl, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({ data: data })
            });

            if (!response.ok) {
                const errorData = await response.json();
                throw new Error(errorData.error || 'Model prediction failed');
            }

            const result = await response.json();
            
            if (!result.success) {
                throw new Error(result.error || 'Prediction failed');
            }

            // Convert model results to our format
            const predictions = result.predictions.map((pred, index) => ({
                index: pred.index,
                isExoplanet: pred.is_exoplanet,
                confidence: pred.confidence,
                exoplanetProbability: pred.exoplanet_probability,
                falsePositiveProbability: pred.false_positive_probability,
                data: data[index] // Original data row
            }));

            console.log(`✅ Model predictions completed: ${predictions.length} samples processed`);
            return predictions;

        } catch (error) {
            throw new Error(`Model Prediction Error: ${error.message}`);
        }
    }

    predictExoplanet(row) {
        // Enhanced prediction logic based on exoplanet characteristics
        // Based on Kepler mission data patterns
        
        let score = 0;
        let factors = [];
        
        // Period factor (exoplanets typically have periods > 0)
        if (row.koi_period > 0) {
            score += 2;
            factors.push('period');
        }
        
        // Depth factor (transit depth indicates planet size)
        if (row.koi_depth > 0) {
            score += 2;
            factors.push('depth');
        }
        
        // Planet radius factor
        if (row.koi_prad > 0) {
            score += 1.5;
            factors.push('radius');
        }
        
        // Signal-to-noise ratio (higher is better)
        if (row.koi_model_snr > 0) {
            score += 1.5;
            factors.push('snr');
        }
        
        // Impact parameter (should be reasonable for transits)
        if (row.koi_impact >= 0 && row.koi_impact <= 1) {
            score += 1;
            factors.push('impact');
        }
        
        // Duration factor (transit duration should be positive)
        if (row.koi_duration > 0) {
            score += 1;
            factors.push('duration');
        }
        
        // Temperature factor (equilibrium temperature)
        if (row.koi_teq > 0) {
            score += 0.5;
            factors.push('temperature');
        }
        
        // Insolation factor (stellar flux)
        if (row.koi_insol > 0) {
            score += 0.5;
            factors.push('insolation');
        }
        
        // False positive flags (negative values indicate fewer false positives)
        if (row.koi_fpflag_nt < 0) score += 0.5;
        if (row.koi_fpflag_ss < 0) score += 0.5;
        if (row.koi_fpflag_co < 0) score += 0.5;
        if (row.koi_fpflag_ec < 0) score += 0.5;
        
        // Store factors for debugging
        row._predictionFactors = factors;
        row._predictionScore = score;
        
        return score >= 4; // Threshold for exoplanet classification
    }
    
    calculateConfidence(row) {
        // Calculate confidence based on prediction score and data quality
        const baseScore = row._predictionScore || 0;
        const maxPossibleScore = 12; // Maximum possible score
        
        // Base confidence from score
        let confidence = Math.min(baseScore / maxPossibleScore, 1);
        
        // Boost confidence for high-quality indicators
        if (row.koi_model_snr > 0.5) confidence += 0.1;
        if (row.koi_depth > 0.1) confidence += 0.1;
        if (row.koi_period > 0.1) confidence += 0.1;
        
        // Reduce confidence for potential false positives
        if (row.koi_fpflag_nt > 0) confidence -= 0.1;
        if (row.koi_fpflag_ss > 0) confidence -= 0.1;
        
        return Math.max(0.5, Math.min(0.99, confidence)); // Keep confidence between 50% and 99%
    }

    calculateAccuracy(predictions) {
        if (!this.hasGroundTruth) return null;
        
        let truePositives = 0;  // Correctly predicted exoplanets
        let trueNegatives = 0;  // Correctly predicted non-exoplanets
        let falsePositives = 0; // Incorrectly predicted as exoplanets
        let falseNegatives = 0; // Incorrectly predicted as non-exoplanets
        
        predictions.forEach(prediction => {
            const groundTruth = this.getGroundTruth(prediction.data);
            const predicted = prediction.isExoplanet;
            
            if (groundTruth === 1 && predicted === true) {
                truePositives++;
            } else if (groundTruth === 0 && predicted === false) {
                trueNegatives++;
            } else if (groundTruth === 0 && predicted === true) {
                falsePositives++;
            } else if (groundTruth === 1 && predicted === false) {
                falseNegatives++;
            }
        });
        
        const total = predictions.length;
        const accuracy = (truePositives + trueNegatives) / total;
        const precision = truePositives / (truePositives + falsePositives) || 0;
        const recall = truePositives / (truePositives + falseNegatives) || 0;
        const f1Score = 2 * (precision * recall) / (precision + recall) || 0;
        
        return {
            accuracy: accuracy,
            precision: precision,
            recall: recall,
            f1Score: f1Score,
            truePositives: truePositives,
            trueNegatives: trueNegatives,
            falsePositives: falsePositives,
            falseNegatives: falseNegatives,
            total: total
        };
    }
    
    getGroundTruth(row) {
        // Check for common ground truth column names (0/1 format)
        if ('is_exoplanet' in row) return parseInt(row.is_exoplanet);
        if ('exoplanet' in row) return parseInt(row.exoplanet);
        if ('label' in row) return parseInt(row.label);
        if ('target' in row) return parseInt(row.target);
        return null;
    }

    displayResults(predictions) {
        const resultsContainer = document.getElementById('resultsContainer');
        
        let exoplanetCount = 0;
        let notExoplanetCount = 0;

        predictions.forEach(prediction => {
            const resultItem = document.createElement('div');
            resultItem.className = `result-item ${prediction.isExoplanet ? 'exoplanet' : 'not-exoplanet'}`;
            
            const label = document.createElement('div');
            label.className = `result-label ${prediction.isExoplanet ? 'exoplanet' : 'not-exoplanet'}`;
            label.textContent = prediction.isExoplanet ? '🌍 Exoplanet' : '⭐ Not Exoplanet';
            
            const confidence = document.createElement('div');
            confidence.className = 'result-confidence';
            confidence.textContent = `${(prediction.confidence * 100).toFixed(1)}% confidence`;
            
            // Add detailed info
            const details = document.createElement('div');
            details.className = 'result-details';
            details.style.fontSize = '0.9rem';
            details.style.color = '#666';
            details.style.marginTop = '5px';
            
            const exoplanetProb = prediction.exoplanetProbability || 0;
            const falsePositiveProb = prediction.falsePositiveProbability || 0;
            
            details.innerHTML = `
                <div><strong>Model Prediction:</strong> ${prediction.isExoplanet ? 'CONFIRMED' : 'FALSE POSITIVE'}</div>
                <div><strong>Exoplanet Probability:</strong> ${(exoplanetProb * 100).toFixed(1)}% | <strong>False Positive Probability:</strong> ${(falsePositiveProb * 100).toFixed(1)}%</div>
                <div><strong>Key Values:</strong> Period: ${prediction.data.koi_period.toFixed(3)} | Depth: ${prediction.data.koi_depth.toFixed(3)} | SNR: ${prediction.data.koi_model_snr.toFixed(3)}</div>
            `;
            
            resultItem.appendChild(label);
            resultItem.appendChild(confidence);
            resultItem.appendChild(details);
            resultsContainer.appendChild(resultItem);

            if (prediction.isExoplanet) {
                exoplanetCount++;
            } else {
                notExoplanetCount++;
            }
        });

        // Add summary
        const summary = document.createElement('div');
        summary.className = 'success-message';
        
        // Calculate accuracy if ground truth is available
        const accuracyMetrics = this.calculateAccuracy(predictions);
        
        let summaryHTML = `
            <h3>📊 Model Prediction Summary</h3>
            <p><strong>Total objects analyzed:</strong> ${predictions.length}</p>
            <p><strong>🌍 CONFIRMED Exoplanets:</strong> ${exoplanetCount}</p>
            <p><strong>⭐ FALSE POSITIVES:</strong> ${notExoplanetCount}</p>
            <p><strong>Exoplanet detection rate:</strong> ${((exoplanetCount / predictions.length) * 100).toFixed(1)}%</p>
            <p><strong>Average model confidence:</strong> ${(predictions.reduce((sum, p) => sum + p.confidence, 0) / predictions.length * 100).toFixed(1)}%</p>
        `;
        
        if (accuracyMetrics) {
            summaryHTML += `
                <hr style="margin: 15px 0; border: 1px solid #ddd;">
                <h3>🎯 Model Accuracy Analysis</h3>
                <p><strong>Overall Accuracy:</strong> ${(accuracyMetrics.accuracy * 100).toFixed(1)}%</p>
                <p><strong>Precision:</strong> ${(accuracyMetrics.precision * 100).toFixed(1)}% (True Positives / All Predicted Positives)</p>
                <p><strong>Recall:</strong> ${(accuracyMetrics.recall * 100).toFixed(1)}% (True Positives / All Actual Positives)</p>
                <p><strong>F1-Score:</strong> ${(accuracyMetrics.f1Score * 100).toFixed(1)}% (Harmonic mean of Precision & Recall)</p>
                <div style="margin-top: 10px; font-size: 0.9rem; color: #666;">
                    <p><strong>Confusion Matrix:</strong></p>
                    <p>True Positives: ${accuracyMetrics.truePositives} | False Positives: ${accuracyMetrics.falsePositives}</p>
                    <p>False Negatives: ${accuracyMetrics.falseNegatives} | True Negatives: ${accuracyMetrics.trueNegatives}</p>
                </div>
            `;
        }
        
        summary.innerHTML = summaryHTML;
        resultsContainer.appendChild(summary);
    }

    showError(message) {
        const resultsSection = document.getElementById('resultsSection');
        const resultsContainer = document.getElementById('resultsContainer');
        
        resultsSection.style.display = 'block';
        resultsContainer.innerHTML = `
            <div class="error-message">
                <h3>❌ Error</h3>
                <p>${message}</p>
            </div>
        `;
    }
}

// Initialize the application when the page loads
document.addEventListener('DOMContentLoaded', () => {
    new ExoplanetPredictor();
});
