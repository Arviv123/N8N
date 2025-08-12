#!/usr/bin/env node
import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { SSEServerTransport } from '@modelcontextprotocol/sdk/server/sse.js';
import { CallToolRequestSchema, ErrorCode, ListToolsRequestSchema, McpError } from '@modelcontextprotocol/sdk/types.js';
import fetch from 'node-fetch';
import express from 'express';
import cors from 'cors';

// Base URL for Iplan services
const BASE_URL = "https://ags.iplan.gov.il/arcgisiplan/rest/services";

class IplanMCPServer {
    server;
    app;
    httpServer;

    constructor() {
        // יצירת שרת MCP
        this.server = new Server({
            name: 'iplan-israel-planning',
            version: '1.0.0',
        }, {
            capabilities: {
                tools: {}
            }
        });
        
        this.setupToolHandlers();
        this.setupExpressApp();
    }

    setupExpressApp() {
        this.app = express();
        
        // CORS - להתאימות טובה יותר
        this.app.use(cors({
            origin: '*',
            methods: ['GET', 'POST', 'OPTIONS'],
            allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With', 'Accept', 'Cache-Control'],
            credentials: false
        }));
        
        this.app.use(express.json({ limit: '10mb' }));
        this.app.use(express.urlencoded({ extended: true }));

        // Health check endpoint
        this.app.get('/', (req, res) => {
            res.json({ 
                status: 'running', 
                server: 'Iplan MCP Server',
                version: '1.0.0',
                description: 'שרת MCP למינהל התכנון הישראלי',
                mcp_endpoint: '/sse',
                test_endpoint: '/test',
                tools_count: 4
            });
        });

        // Test endpoint
        this.app.get('/test', async (req, res) => {
            try {
                console.log('Test endpoint called');
                
                // בדיקה מהירה של שירות התכנון
                const testUrl = `${BASE_URL}/PlanningPublic/Xplan/MapServer?f=json`;
                const response = await fetch(testUrl, {
                    method: 'GET',
                    timeout: 10000
                });
                
                const isServiceUp = response.ok;
                
                res.json({
                    mcp_server: 'running',
                    iplan_service: isServiceUp ? 'available' : 'unavailable',
                    test_time: new Date().toISOString(),
                    tools: ['search_plans', 'get_plan_details', 'search_by_location', 'check_service_status']
                });
            } catch (error) {
                res.status(500).json({
                    mcp_server: 'running',
                    iplan_service: 'error',
                    error: error.message
                });
            }
        });

        // **נקודת ה-SSE הנכונה - זה הלב של MCP**
        this.app.use('/sse', (req, res, next) => {
            console.log(`SSE request: ${req.method} ${req.url}`);
            
            // הטמעת SSE Transport נכונה
            try {
                // יצירת SSE Transport עם Response object
                const transport = new SSEServerTransport('/sse', res);
                
                // חיבור שרת MCP ל-Transport
                this.server.connect(transport).then(() => {
                    console.log('✅ MCP Server connected successfully via SSE');
                }).catch(error => {
                    console.error('❌ MCP Server connection failed:', error);
                });

                // Event handlers לניהול החיבור
                req.on('close', () => {
                    console.log('🔌 SSE client disconnected');
                });

                req.on('error', (error) => {
                    console.error('⚠️ SSE request error:', error);
                });

                // SSE Transport יטפל בכל השאר
                
            } catch (error) {
                console.error('💥 SSE setup error:', error);
                if (!res.headersSent) {
                    res.status(500).json({
                        error: 'SSE setup failed',
                        message: error.message
                    });
                }
            }
        });

        // Error handler
        this.app.use((error, req, res, next) => {
            console.error('Express error:', error);
            if (!res.headersSent) {
                res.status(500).json({
                    error: 'Internal server error',
                    message: error.message
                });
            }
        });
    }

    setupToolHandlers() {
        // רשימת הכלים
        this.server.setRequestHandler(ListToolsRequestSchema, async () => {
            console.log('📋 Tools list requested');
            return {
                tools: [
                    {
                        name: 'search_plans',
                        description: 'חיפוש תכניות במינהל התכנון הישראלי עם פילטרים',
                        inputSchema: {
                            type: 'object',
                            properties: {
                                searchTerm: {
                                    type: 'string',
                                    description: 'מילת חיפוש (שם תכנית או מספר)'
                                },
                                district: {
                                    type: 'string',
                                    description: 'מחוז (תל אביב, ירושלים, חיפה, צפון, מרכז, דרום)'
                                },
                                limit: {
                                    type: 'number',
                                    description: 'מספר מקסימלי של תוצאות (1-20)',
                                    minimum: 1,
                                    maximum: 20,
                                    default: 10
                                }
                            }
                        }
                    },
                    {
                        name: 'get_plan_details',
                        description: 'קבלת פרטים מלאים על תכנית ספציפית לפי מספר תכנית',
                        inputSchema: {
                            type: 'object',
                            properties: {
                                planNumber: {
                                    type: 'string',
                                                        description: 'מספר התכנית הרשמי (לדוגמה: תא/2500)'
                                }
                            },
                            required: ['planNumber']
                        }
                    },
                    {
                        name: 'search_by_location',
                        description: 'חיפוש תכניות לפי קואורדינטות גיאוגרפיות',
                        inputSchema: {
                            type: 'object',
                            properties: {
                                x: {
                                    type: 'number',
                                    description: 'קואורדינטת X במערכת ישראל TM'
                                },
                                y: {
                                    type: 'number',
                                    description: 'קואורדינטת Y במערכת ישראל TM'
                                },
                                radius: {
                                    type: 'number',
                                    description: 'רדיוס חיפוש במטרים (100-2000)',
                                    minimum: 100,
                                    maximum: 2000,
                                    default: 500
                                }
                            },
                            required: ['x', 'y']
                        }
                    },
                    {
                        name: 'check_service_status',
                        description: 'בדיקת זמינות ותקינות שירותי מינהל התכנון',
                        inputSchema: {
                            type: 'object',
                            properties: {}
                        }
                    }
                ]
            };
        });

        // טיפול בקריאות לכלים
        this.server.setRequestHandler(CallToolRequestSchema, async (request) => {
            const { name, arguments: args } = request.params;
            
            console.log(`🔧 Tool called: ${name}`, args);
            
            try {
                switch (name) {
                    case 'search_plans':
                        return await this.searchPlans(args || {});
                    case 'get_plan_details':
                        return await this.getPlanDetails(args?.planNumber);
                    case 'search_by_location':
                        return await this.searchByLocation(args?.x, args?.y, args?.radius);
                    case 'check_service_status':
                        return await this.checkServiceStatus();
                    default:
                        throw new McpError(ErrorCode.MethodNotFound, `כלי לא ידוע: ${name}`);
                }
            } catch (error) {
                console.error(`❌ Tool execution error (${name}):`, error);
                
                if (error instanceof McpError) {
                    throw error;
                }
                throw new McpError(
                    ErrorCode.InternalError, 
                    `שגיאה בהרצת הכלי ${name}: ${error.message}`
                );
            }
        });
    }

    // כלי חיפוש תכניות
    async searchPlans(params = {}) {
        try {
            const whereClause = this.buildWhereClause(params);
            const limit = Math.min(Math.max(params.limit || 10, 1), 20);
            
            const url = `${BASE_URL}/PlanningPublic/Xplan/MapServer/1/query`;
            const searchParams = new URLSearchParams({
                'where': whereClause,
                'outFields': 'pl_name,pl_number,district_name,plan_area_name,pl_area_dunam,pl_date_8,jurstiction_area_name,pl_landuse_string',
                'f': 'json',
                'returnGeometry': 'false',
                'resultRecordCount': limit.toString()
            });

            console.log(`🔍 Searching plans: ${whereClause}`);

            const response = await fetch(`${url}?${searchParams}`, {
                method: 'GET',
                headers: { 'Accept': 'application/json' },
                timeout: 15000
            });

            if (!response.ok) {
                throw new Error(`שגיאת HTTP: ${response.status}`);
            }

            const data = await response.json();
            
            if (data?.error) {
                throw new Error(`שגיאת API: ${data.error.message}`);
            }

            const results = data?.features || [];
            
            // עיצוב התוצאות
            const formattedResults = results.map(feature => ({
                שם_תכנית: feature.attributes.pl_name,
                מספר_תכנית: feature.attributes.pl_number,
                מחוז: feature.attributes.district_name,
                אזור_תכנית: feature.attributes.plan_area_name,
                שטח_דונמים: feature.attributes.pl_area_dunam,
                תאריך_אישור: feature.attributes.pl_date_8,
                סמכות: feature.attributes.jurstiction_area_name,
                ייעוד_קרקע: feature.attributes.pl_landuse_string
            }));

            const summary = `🎯 נמצאו ${results.length} תכניות`;
            const details = formattedResults.length > 0 ? 
                '\n\n📋 פרטי התכניות:\n' + JSON.stringify(formattedResults, null, 2) :
                '\n\n❌ לא נמצאו תכניות המתאימות לקריטריונים';

            return {
                content: [
                    {
                        type: 'text',
                        text: summary + details
                    }
                ]
            };
            
        } catch (error) {
            console.error('Search plans error:', error);
            return {
                content: [
                    {
                        type: 'text',
                        text: `❌ שגיאה בחיפוש תכניות: ${error.message}`
                    }
                ]
            };
        }
    }

    // כלי קבלת פרטי תכנית
    async getPlanDetails(planNumber) {
        if (!planNumber) {
            throw new McpError(ErrorCode.InvalidParams, 'חובה לספק מספר תכנית');
        }

        try {
            const url = `${BASE_URL}/PlanningPublic/Xplan/MapServer/1/query`;
            const searchParams = new URLSearchParams({
                'where': `pl_number = '${planNumber}'`,
                'outFields': '*',
                'f': 'json',
                'returnGeometry': 'false'
            });

            console.log(`📄 Getting plan details: ${planNumber}`);

            const response = await fetch(`${url}?${searchParams}`, {
                method: 'GET',
                headers: { 'Accept': 'application/json' },
                timeout: 15000
            });

            if (!response.ok) {
                throw new Error(`שגיאת HTTP: ${response.status}`);
            }

            const data = await response.json();
            
            if (data?.error) {
                throw new Error(`שגיאת API: ${data.error.message}`);
            }

            const results = data?.features || [];
            
            if (results.length === 0) {
                return {
                    content: [
                        {
                            type: 'text',
                            text: `❌ לא נמצאה תכנית עם מספר: ${planNumber}`
                        }
                    ]
                };
            }

            const planDetails = results[0].attributes;
            
            return {
                content: [
                    {
                        type: 'text',
                        text: `📄 פרטי תכנית ${planNumber}:\n\n${JSON.stringify(planDetails, null, 2)}`
                    }
                ]
            };
            
        } catch (error) {
            console.error('Get plan details error:', error);
            return {
                content: [
                    {
                        type: 'text',
                        text: `❌ שגיאה בקבלת פרטי תכנית: ${error.message}`
                    }
                ]
            };
        }
    }

    // כלי חיפוש לפי מיקום
    async searchByLocation(x, y, radius = 500) {
        if (!x || !y) {
            throw new McpError(ErrorCode.InvalidParams, 'חובה לספק קואורדינטות X ו-Y');
        }

        try {
            const url = `${BASE_URL}/PlanningPublic/Xplan/MapServer/1/query`;
            const searchParams = new URLSearchParams({
                'geometry': `${x},${y}`,
                'geometryType': 'esriGeometryPoint',
                'distance': radius.toString(),
                'units': 'esriSRUnit_Meter',
                'spatialRel': 'esriSpatialRelWithin',
                'outFields': 'pl_name,pl_number,district_name,plan_area_name,pl_area_dunam',
                'f': 'json',
                'returnGeometry': 'false',
                'resultRecordCount': '10'
            });

            console.log(`📍 Searching by location: (${x}, ${y}) radius: ${radius}m`);

            const response = await fetch(`${url}?${searchParams}`, {
                method: 'GET',
                headers: { 'Accept': 'application/json' },
                timeout: 15000
            });

            if (!response.ok) {
                throw new Error(`שגיאת HTTP: ${response.status}`);
            }

            const data = await response.json();
            
            if (data?.error) {
                throw new Error(`שגיאת API: ${data.error.message}`);
            }

            const results = data?.features || [];
            
            return {
                content: [
                    {
                        type: 'text',
                        text: `📍 נמצאו ${results.length} תכניות ברדיוס ${radius} מטר מהנקודה (${x}, ${y}):\n\n${JSON.stringify(results.map(f => f.attributes), null, 2)}`
                    }
                ]
            };
            
        } catch (error) {
            console.error('Search by location error:', error);
            return {
                content: [
                    {
                        type: 'text',
                        text: `❌ שגיאה בחיפוש לפי מיקום: ${error.message}`
                    }
                ]
            };
        }
    }

    // בדיקת סטטוס השירות
    async checkServiceStatus() {
        try {
            const testUrl = `${BASE_URL}/PlanningPublic/Xplan/MapServer?f=json`;
            
            console.log('🔍 Checking service status...');
            
            const response = await fetch(testUrl, {
                method: 'GET',
                headers: { 'Accept': 'application/json' },
                timeout: 10000
            });

            const data = await response.json();
            
            const statusInfo = {
                זמינות: response.ok ? '✅ זמין' : '❌ לא זמין',
                שם_שירות: data.mapName || 'לא ידוע',
                גרסה: data.currentVersion || 'לא ידוע',
                שכבות_זמינות: data.layers?.length || 0,
                תאריך_בדיקה: new Date().toLocaleString('he-IL')
            };
            
            return {
                content: [
                    {
                        type: 'text',
                        text: `🔍 סטטוס שירותי מינהל התכנון:\n\n${JSON.stringify(statusInfo, null, 2)}`
                    }
                ]
            };
            
        } catch (error) {
            console.error('Service status check error:', error);
            return {
                content: [
                    {
                        type: 'text',
                        text: `❌ שגיאה בבדיקת סטטוס השירות: ${error.message}`
                    }
                ]
            };
        }
    }

    // בניית WHERE clause
    buildWhereClause(params = {}) {
        const conditions = [];
        
        if (params.searchTerm) {
            conditions.push(`(pl_name LIKE '%${params.searchTerm}%' OR pl_number LIKE '%${params.searchTerm}%')`);
        }
        
        if (params.district) {
            conditions.push(`district_name LIKE '%${params.district}%'`);
        }

        return conditions.length > 0 ? conditions.join(' AND ') : '1=1';
    }

    // הרצה במצב stdio
    async runStdio() {
        const transport = new StdioServerTransport();
        await this.server.connect(transport);
        console.error('🚀 Iplan MCP Server running on stdio');
    }

    // הרצה במצב HTTP
    async runHTTP(port = 3000, host = '0.0.0.0') {
        this.httpServer = this.app.listen(port, host, () => {
            console.log('🎉════════════════════════════════════════════════════════');
            console.log(`🚀 Iplan MCP Server is RUNNING!`);
            console.log(`📡 Address: http://${host}:${port}`);
            console.log(`🔗 MCP SSE Endpoint: http://${host}:${port}/sse`);
            console.log(`🧪 Test Endpoint: http://${host}:${port}/test`);
            console.log(`🛠️  Available Tools: 4`);
            console.log('🎉════════════════════════════════════════════════════════');
        });

        // Graceful shutdown
        const shutdown = () => {
            console.log('⏹️  Shutting down gracefully...');
            this.httpServer?.close(() => {
                console.log('✅ HTTP server closed.');
                process.exit(0);
            });
        };

        process.on('SIGTERM', shutdown);
        process.on('SIGINT', shutdown);

        return this.httpServer;
    }
}

// ========== MAIN EXECUTION ==========
async function main() {
    const server = new IplanMCPServer();
    
    const args = process.argv.slice(2);
    const mode = args[0] || 'stdio';
    
    if (mode === 'http' || mode === 'sse') {
        const port = parseInt(args[1]) || process.env.PORT || 3000;
        const host = args[2] || '0.0.0.0';
        await server.runHTTP(port, host);
    } else {
        await server.runStdio();
    }
}

export { IplanMCPServer };

if (import.meta.url === `file://${process.argv[1]}`) {
    main().catch(console.error);
}

/*
📋 הוראות השימוש:

1. התקנת dependencies:
   npm install @modelcontextprotocol/sdk express cors node-fetch

2. הרצה מקומית:
   node server.js http 3000

3. שימוש ב-N8N:
   MCP Client Tool -> SSE Endpoint: http://localhost:3000/sse

4. בדיקת תקינות:
   curl http://localhost:3000/test

5. כלים זמינים:
   - search_plans: חיפוש תכניות
   - get_plan_details: פרטי תכנית ספציפית  
   - search_by_location: חיפוש לפי קואורדינטות
   - check_service_status: בדיקת זמינות השירות
*/