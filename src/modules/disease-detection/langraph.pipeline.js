import { StateGraph, END } from "@langchain/langgraph";
import { createProvider, analyzeWithFallback } from './ai-providers.js';
import Analysis from './analysis.mode.js';

// Define the state structure for our pipeline
class AnalysisState {
  constructor(data = {}) {
    this.analysisId = data.analysisId;
    this.imageUrl = data.imageUrl;
    this.cropType = data.cropType;
    this.location = data.location;
    this.provider = data.provider || 'groq';
    
    // Processing results
    this.imageAnalysis = data.imageAnalysis || null;
    this.diseaseDetection = data.diseaseDetection || null;
    this.recommendations = data.recommendations || null;
    this.finalResult = data.finalResult || null;
    
    // Error tracking
    this.errors = data.errors || [];
    this.currentStep = data.currentStep || 'initialization';
    this.stepResults = data.stepResults || {};
  }

  addError(step, error) {
    this.errors.push({ step, error: error.message, timestamp: new Date() });
  }

  updateStep(step, result) {
    this.currentStep = step;
    this.stepResults[step] = result;
  }
}

// Step 1: Initialize and validate inputs
async function initializeAnalysis(state) {
  console.log(`Starting analysis for ID: ${state.analysisId}`);
  
  try {
    // Validate inputs
    if (!state.analysisId) throw new Error('Analysis ID is required');
    if (!state.imageUrl) throw new Error('Image URL is required');
    
    // Update analysis status
    await Analysis.findByIdAndUpdate(state.analysisId, {
      status: 'processing',
      $push: {
        processingSteps: {
          step: 'initialization',
          status: 'completed',
          result: { message: 'Analysis pipeline started', timestamp: new Date() }
        }
      }
    });

    state.updateStep('initialization', { success: true });
    return state;
  } catch (error) {
    state.addError('initialization', error);
    throw error;
  }
}

// Step 2: Perform image analysis with fallback
async function performImageAnalysis(state) {
  console.log(`Performing image analysis with provider: ${state.provider}`);
  
  try {
    // Use fallback analysis that tries multiple providers
    const result = await analyzeWithFallback(
      state.imageUrl, 
      state.cropType, 
      state.location, 
      state.provider
    );
    
    console.log('Image analysis result:', JSON.stringify(result, null, 2));
    
    // Validate the result has required fields
    if (!result.disease) {
      throw new Error('AI provider returned incomplete analysis - missing disease information');
    }
    
    state.imageAnalysis = result;
    state.updateStep('imageAnalysis', { 
      success: true, 
      provider: result.provider,
      disease: result.disease,
      confidence: result.confidence 
    });
    
    // Update database
    await Analysis.findByIdAndUpdate(state.analysisId, {
      aiProvider: result.provider, // Update with actual provider used
      $push: {
        processingSteps: {
          step: 'imageAnalysis',
          status: 'completed',
          result: { 
            provider: result.provider, 
            detected: result.disease,
            confidence: result.confidence,
            timestamp: new Date()
          }
        }
      },
      'rawResponses.imageAnalysis': result
    });
    
    return state;
  } catch (error) {
    console.error('Image analysis failed:', error);
    state.addError('imageAnalysis', error);
    
    await Analysis.findByIdAndUpdate(state.analysisId, {
      $push: {
        processingSteps: {
          step: 'imageAnalysis',
          status: 'failed',
          error: error.message,
          timestamp: new Date()
        }
      }
    });
    
    throw error;
  }
}

// Step 3: Process disease detection results
async function processDiseaseDetection(state) {
  console.log('Processing disease detection results');
  
  try {
    const analysis = state.imageAnalysis;
    
    if (!analysis || !analysis.disease) {
      throw new Error('No disease detection results available from image analysis');
    }
    
    // Enhanced disease detection logic
    const detection = {
      disease: analysis.disease,
      confidence: Math.max(0, Math.min(1, analysis.confidence || 0)), // Ensure 0-1 range
      severity: analysis.severity || 'medium',
      symptoms: Array.isArray(analysis.symptoms) ? analysis.symptoms : [],
      analysisProvider: analysis.provider || state.provider
    };
    
    // Apply business logic for confidence thresholds
    if (detection.confidence < 0.3) {
      detection.disease = 'Inconclusive - requires expert review';
      detection.severity = 'unknown';
      detection.needsExpertReview = true;
    } else if (detection.confidence >= 0.8) {
      detection.severity = 'high';
      detection.reliable = true;
    }
    
    state.diseaseDetection = detection;
    state.updateStep('diseaseDetection', detection);
    
    await Analysis.findByIdAndUpdate(state.analysisId, {
      detection: detection,
      confidence: detection.confidence,
      $push: {
        processingSteps: {
          step: 'diseaseDetection',
          status: 'completed',
          result: {
            disease: detection.disease,
            confidence: detection.confidence,
            severity: detection.severity,
            timestamp: new Date()
          }
        }
      }
    });
    
    return state;
  } catch (error) {
    console.error('Disease detection processing failed:', error);
    state.addError('diseaseDetection', error);
    
    await Analysis.findByIdAndUpdate(state.analysisId, {
      $push: {
        processingSteps: {
          step: 'diseaseDetection',
          status: 'failed',
          error: error.message,
          timestamp: new Date()
        }
      }
    });
    
    throw error;
  }
}

// Step 4: Generate recommendations
async function generateRecommendations(state) {
  console.log('Generating treatment recommendations');
  
  try {
    const analysis = state.imageAnalysis;
    const detection = state.diseaseDetection;
    
    if (!analysis) {
      throw new Error('No image analysis available for recommendations');
    }
    
    // Process recommendations from AI analysis
    const recommendations = {
      treatment: enhanceTreatments(analysis.treatment || [], state.location, state.cropType),
      fertilizers: filterFertilizers(analysis.fertilizers || [], state.location),
      homeRemedies: analysis.homeRemedies || [],
      preventiveMeasures: analysis.prevention || []
    };
    
    // Add fallback recommendations if arrays are empty
    if (recommendations.treatment.length === 0) {
      recommendations.treatment.push({
        method: 'General Treatment',
        description: `Consult local agricultural expert for ${state.cropType} disease management`,
        priority: 'high'
      });
    }
    
    if (recommendations.fertilizers.length === 0) {
      recommendations.fertilizers = [
        'Balanced NPK fertilizer (10-10-10)',
        'Organic compost for soil health'
      ];
    }
    
    if (recommendations.homeRemedies.length === 0) {
      recommendations.homeRemedies = [
        'Neem oil spray (organic treatment)',
        'Proper plant hygiene maintenance'
      ];
    }
    
    if (recommendations.preventiveMeasures.length === 0) {
      recommendations.preventiveMeasures = [
        'Regular plant inspection',
        'Maintain proper plant spacing',
        'Ensure good drainage and air circulation'
      ];
    }
    
    state.recommendations = recommendations;
    state.updateStep('recommendations', { 
      success: true, 
      treatmentCount: recommendations.treatment.length,
      fertilizerCount: recommendations.fertilizers.length
    });
    
    await Analysis.findByIdAndUpdate(state.analysisId, {
      recommendations: recommendations,
      $push: {
        processingSteps: {
          step: 'recommendations',
          status: 'completed',
          result: { 
            treatmentOptions: recommendations.treatment.length,
            fertilizerOptions: recommendations.fertilizers.length,
            homeRemediesCount: recommendations.homeRemedies.length,
            timestamp: new Date()
          }
        }
      }
    });
    
    return state;
  } catch (error) {
    console.error('Recommendations generation failed:', error);
    state.addError('recommendations', error);
    
    await Analysis.findByIdAndUpdate(state.analysisId, {
      $push: {
        processingSteps: {
          step: 'recommendations',
          status: 'failed',
          error: error.message,
          timestamp: new Date()
        }
      }
    });
    
    throw error;
  }
}

// Helper method to enhance treatments
function enhanceTreatments(treatments, location, cropType) {
  if (!Array.isArray(treatments)) return [];
  
  return treatments.map(treatment => {
    // Handle both object and string formats
    if (typeof treatment === 'string') {
      treatment = { method: treatment, description: treatment, priority: 'medium' };
    }
    
    return {
      method: treatment.method || 'General Treatment',
      description: treatment.description || treatment.method || 'Apply as recommended',
      priority: treatment.priority || 'medium',
      locationSpecific: true,
      cropSpecific: cropType || 'general',
      availabilityNote: `Available at agricultural stores in ${location?.district || location?.state || 'your area'}`
    };
  });
}

// Helper method to filter fertilizers by location
function filterFertilizers(fertilizers, location) {
  if (!Array.isArray(fertilizers)) return [];
  
  return fertilizers.map(fertilizer => {
    const baseRecommendation = typeof fertilizer === 'string' ? fertilizer : fertilizer.name || 'Fertilizer';
    return `${baseRecommendation} (available in ${location?.state || 'India'})`;
  });
}

// Step 5: Finalize results
async function finalizeResults(state) {
  console.log('Finalizing analysis results');
  
  try {
    if (!state.diseaseDetection || !state.recommendations) {
      throw new Error('Cannot finalize - missing detection or recommendations');
    }
    
    const finalResult = {
      analysisId: state.analysisId,
      detection: state.diseaseDetection,
      recommendations: state.recommendations,
      metadata: {
        provider: state.diseaseDetection.analysisProvider || state.provider,
        processingSteps: Object.keys(state.stepResults),
        completedAt: new Date(),
        confidence: state.diseaseDetection.confidence || 0,
        cropType: state.cropType,
        location: state.location
      }
    };
    
    state.finalResult = finalResult;
    
    // Final database update with complete data
    await Analysis.findByIdAndUpdate(state.analysisId, {
      status: 'completed',
      aiProvider: state.diseaseDetection.analysisProvider || state.provider,
      confidence: state.diseaseDetection.confidence,
      $push: {
        processingSteps: {
          step: 'finalization',
          status: 'completed',
          result: { message: 'Analysis completed successfully', timestamp: new Date() }
        }
      }
    });
    
    console.log(`Analysis ${state.analysisId} completed successfully`);
    return state;
  } catch (error) {
    console.error('Results finalization failed:', error);
    state.addError('finalization', error);
    
    await Analysis.findByIdAndUpdate(state.analysisId, {
      status: 'failed',
      error: error.message,
      $push: {
        processingSteps: {
          step: 'finalization',
          status: 'failed',
          error: error.message,
          timestamp: new Date()
        }
      }
    });
    
    throw error;
  }
}

// Error handler
async function handleError(state) {
  console.error(`Analysis ${state.analysisId} failed:`, state.errors);
  
  const latestError = state.errors[state.errors.length - 1];
  
  await Analysis.findByIdAndUpdate(state.analysisId, {
    status: 'failed',
    error: latestError?.error || 'Unknown error occurred',
    $push: {
      processingSteps: {
        step: 'error_handling',
        status: 'completed',
        error: latestError?.error,
        result: { 
          errorStep: latestError?.step,
          timestamp: new Date()
        }
      }
    }
  });
  
  return state;
}

// FIXED: Routing function to determine next step
function routeAnalysis(state) {
  console.log(`[ROUTING] Current step: ${state.currentStep}, Errors: ${state.errors?.length || 0}`);
  console.log(`[ROUTING] State keys:`, Object.keys(state));
  
  // Check for errors first
  if (state.errors && state.errors.length > 0) {
    console.log(`[ROUTING] Errors detected, routing to handleError`);
    return "handleError";
  }
  
  // Route based on current step
  switch (state.currentStep) {
    case 'initialization':
      console.log(`[ROUTING] From initialization -> performImageAnalysis`);
      return 'performImageAnalysis';
    case 'imageAnalysis':
      console.log(`[ROUTING] From imageAnalysis -> processDiseaseDetection`);
      return 'processDiseaseDetection';
    case 'diseaseDetection':
      console.log(`[ROUTING] From diseaseDetection -> generateRecommendations`);
      return 'generateRecommendations';
    case 'recommendations':
      console.log(`[ROUTING] From recommendations -> finalizeResults`);
      return 'finalizeResults';
    case 'finalization':
      console.log(`[ROUTING] From finalization -> END`);
      return END;
    default:
      console.warn(`[ROUTING] Unknown step: ${state.currentStep}, routing to error handler`);
      return "handleError";
  }
}

// export function createAnalysisPipeline() {
//   const workflow = new StateGraph({
//     channels: {
//       analysisId: { type: "string" },
//       imageUrl: { type: "string" },
//       cropType: { type: "string" },
//       location: { type: "object" },
//       provider: { type: "string" },
//       imageAnalysis: { type: "object" },
//       diseaseDetection: { type: "object" },
//       recommendations: { type: "object" },
//       finalResult: { type: "object" },
//       errors: { type: "array" },
//       currentStep: { type: "string" },
//       stepResults: { type: "object" }
//     }
//   });

//   // Add nodes to the workflow
//   workflow.addNode("initializeAnalysis", async (state) => {
//     const analysisState = new AnalysisState(state);
//     try {
//       const result = await initializeAnalysis(analysisState);
//       return {
//         ...state, // Preserve all existing state
//         currentStep: 'initialization',
//         stepResults: result.stepResults,
//         errors: result.errors
//       };
//     } catch (error) {
//       analysisState.addError('initializeAnalysis', error);
//       return {
//         ...state, // Preserve all existing state
//         errors: analysisState.errors,
//         currentStep: 'error'
//       };
//     }
//   });

//   workflow.addNode("performImageAnalysis", async (state) => {
//     const analysisState = new AnalysisState(state);
//     try {
//       const result = await performImageAnalysis(analysisState);
//       return {
//         ...state, // Preserve all existing state
//         imageAnalysis: result.imageAnalysis,
//         currentStep: 'imageAnalysis',
//         stepResults: result.stepResults,
//         errors: result.errors,
//         provider: result.imageAnalysis?.provider || state.provider
//       };
//     } catch (error) {
//       analysisState.addError('performImageAnalysis', error);
//       return {
//         ...state, // Preserve all existing state
//         errors: analysisState.errors,
//         currentStep: 'error'
//       };
//     }
//   });

//   workflow.addNode("processDiseaseDetection", async (state) => {
//     const analysisState = new AnalysisState(state);
//     try {
//       const result = await processDiseaseDetection(analysisState);
//       return {
//         ...state, // Preserve all existing state
//         diseaseDetection: result.diseaseDetection,
//         currentStep: 'diseaseDetection',
//         stepResults: result.stepResults,
//         errors: result.errors
//       };
//     } catch (error) {
//       analysisState.addError('processDiseaseDetection', error);
//       return {
//         ...state, // Preserve all existing state
//         errors: analysisState.errors,
//         currentStep: 'error'
//       };
//     }
//   });

//   workflow.addNode("generateRecommendations", async (state) => {
//     const analysisState = new AnalysisState(state);
//     try {
//       const result = await generateRecommendations(analysisState);
//       return {
//         recommendations: result.recommendations,
//         currentStep: result.currentStep,
//         stepResults: result.stepResults,
//         errors: result.errors
//       };
//     } catch (error) {
//       analysisState.addError('generateRecommendations', error);
//       return {
//         errors: analysisState.errors,
//         currentStep: 'error'
//       };
//     }
//   });

//   workflow.addNode("finalizeResults", async (state) => {
//     const analysisState = new AnalysisState(state);
//     try {
//       const result = await finalizeResults(analysisState);
//       return {
//         finalResult: result.finalResult,
//         currentStep: result.currentStep,
//         stepResults: result.stepResults,
//         errors: result.errors
//       };
//     } catch (error) {
//       analysisState.addError('finalizeResults', error);
//       return {
//         errors: analysisState.errors,
//         currentStep: 'error'
//       };
//     }
//   });

//   workflow.addNode("handleError", async (state) => {
//     const analysisState = new AnalysisState(state);
//     await handleError(analysisState);
//     return {
//       ...state,
//       currentStep: 'error_handled'
//     };
//   });

//   // Set entry point
//   workflow.setEntryPoint("initializeAnalysis");

//   // FIXED: Add conditional routing with proper edge mapping
//   workflow.addConditionalEdges(
//     "initializeAnalysis",
//     routeAnalysis,
//     {
//       "performImageAnalysis": "performImageAnalysis",
//       "handleError": "handleError"
//     }
//   );

//   workflow.addConditionalEdges(
//     "performImageAnalysis", 
//     routeAnalysis,
//     {
//       "processDiseaseDetection": "processDiseaseDetection",
//       "handleError": "handleError"
//     }
//   );

//   workflow.addConditionalEdges(
//     "processDiseaseDetection",
//     routeAnalysis,
//     {
//       "generateRecommendations": "generateRecommendations", 
//       "handleError": "handleError"
//     }
//   );

//   workflow.addConditionalEdges(
//     "generateRecommendations",
//     routeAnalysis,
//     {
//       "finalizeResults": "finalizeResults",
//       "handleError": "handleError"
//     }
//   );

//   workflow.addConditionalEdges(
//     "finalizeResults",
//     routeAnalysis,
//     {
//       [END]: END,
//       "handleError": "handleError"
//     }
//   );

//   // Add direct edge from handleError to END
//   workflow.addEdge("handleError", END);

//   return workflow.compile();
// }

export function createAnalysisPipeline() {
  const workflow = new StateGraph({
    channels: {
      analysisId: { type: "string" },
      imageUrl: { type: "string" },
      cropType: { type: "string" },
      location: { type: "object" },
      provider: { type: "string" },
      imageAnalysis: { type: "object" },
      diseaseDetection: { type: "object" },
      recommendations: { type: "object" },
      finalResult: { type: "object" },
      errors: { type: "array" },
      currentStep: { type: "string" },
      stepResults: { type: "object" }
    }
  });

  // Helper to create nodes with consistent error handling
  function createNode(nodeName, stepFunction, stepKey) {
    workflow.addNode(nodeName, async (state) => {
      const analysisState = new AnalysisState(state);
      try {
        const result = await stepFunction(analysisState);
        return {
          ...state,
          currentStep: stepKey, // MUST match routeAnalysis keys
          imageAnalysis: result.imageAnalysis || state.imageAnalysis,
          diseaseDetection: result.diseaseDetection || state.diseaseDetection,
          recommendations: result.recommendations || state.recommendations,
          finalResult: result.finalResult || state.finalResult,
          stepResults: result.stepResults,
          errors: result.errors,
          provider: result.imageAnalysis?.provider || state.provider
        };
      } catch (error) {
        analysisState.addError(nodeName, error);
        return {
          ...state,
          errors: analysisState.errors,
          currentStep: 'error'
        };
      }
    });
  }

  // Add all nodes with correct currentStep
  createNode("initializeAnalysis", initializeAnalysis, "initialization");
  createNode("performImageAnalysis", performImageAnalysis, "imageAnalysis");
  createNode("processDiseaseDetection", processDiseaseDetection, "diseaseDetection");
  createNode("generateRecommendations", generateRecommendations, "recommendations");
  createNode("finalizeResults", finalizeResults, "finalization");

  // Error handling node
  workflow.addNode("handleError", async (state) => {
    const analysisState = new AnalysisState(state);
    await handleError(analysisState);
    return {
      ...state,
      currentStep: 'error_handled'
    };
  });

  // Entry point
  workflow.setEntryPoint("initializeAnalysis");

  // Conditional routing with edges
  const edges = [
    ["initializeAnalysis", { performImageAnalysis: "performImageAnalysis", handleError: "handleError" }],
    ["performImageAnalysis", { processDiseaseDetection: "processDiseaseDetection", handleError: "handleError" }],
    ["processDiseaseDetection", { generateRecommendations: "generateRecommendations", handleError: "handleError" }],
    ["generateRecommendations", { finalizeResults: "finalizeResults", handleError: "handleError" }],
    ["finalizeResults", { [END]: END, handleError: "handleError" }]
  ];

  edges.forEach(([node, mapping]) => workflow.addConditionalEdges(node, routeAnalysis, mapping));

  // Direct edge from handleError to END
  workflow.addEdge("handleError", END);

  return workflow.compile();
}


export async function executeAnalysisPipeline(analysisData) {
  const pipeline = createAnalysisPipeline();
  const initialState = {
    analysisId: analysisData.analysisId,
    imageUrl: analysisData.imageUrl,
    cropType: analysisData.cropType || analysisData.crop,
    location: analysisData.location,
    provider: analysisData.provider || 'groq',
    errors: [],
    currentStep: 'initialization',
    stepResults: {},
    imageAnalysis: null,
    diseaseDetection: null,
    recommendations: null,
    finalResult: null
  };

  try {
    console.log('Starting pipeline execution with state:', JSON.stringify(initialState, null, 2));
    const result = await pipeline.invoke(initialState);
    
    console.log('Pipeline result:', JSON.stringify(result, null, 2));
    
    if (result.errors?.length > 0 || result.currentStep === 'error' || result.currentStep === 'error_handled') {
      const errorMessage = result.errors?.[result.errors.length - 1]?.error || 'Analysis pipeline failed';
      console.error('Pipeline completed with errors:', result.errors);
      return {
        success: false,
        message: "Analysis failed",
        error: "ANALYSIS_FAILED",
        details: errorMessage
      };
    }
    
    if (!result.finalResult) {
      console.error('Pipeline completed but no final result generated');
      return {
        success: false,
        message: "Analysis incomplete",
        error: "NO_FINAL_RESULT",
        details: "Pipeline completed but did not generate final results"
      };
    }
    
    console.log('Pipeline completed successfully with final result');
    return {
      success: true,
      data: result.finalResult
    };
  } catch (error) {
    console.error("Pipeline execution failed:", error);
    
    // Update database with error status
    try {
      await Analysis.findByIdAndUpdate(analysisData.analysisId, {
        status: 'failed',
        error: error.message,
        $push: {
          processingSteps: {
            step: 'pipeline_execution',
            status: 'failed',
            error: error.message,
            timestamp: new Date()
          }
        }
      });
    } catch (dbError) {
      console.error('Failed to update database with error:', dbError);
    }
    
    return {
      success: false,
      message: "Pipeline execution failed",
      error: "PIPELINE_ERROR",
      details: error.message
    };
  }
}