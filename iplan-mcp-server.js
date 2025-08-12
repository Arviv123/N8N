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
        this.app.use(cors({
            origin: '*',
            methods: ['GET', 'POST', 'OPTIONS'],
            allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With'],
            credentials: false
        }));
        this.app.use(express.json());
        
        // Health check endpoint
        this.app.get('/', (req, res) => {
            res.json({ 
                status: 'running', 
                server: 'Iplan MCP Server',
                version: '1.0.0',
                protocols: ['stdio', 'sse'],
                endpoints: {
                    health: '/',
                    sse: '/sse',
                    info: '/info'
                },
                tools: [
                    'search_plans',
                    'get_plan_details', 
                    'search_by_location',
                    'get_building_restrictions',
                    'get_infrastructure_data',
                    'get_conservation_sites',
                    'get_comprehensive_location_data',
                    'check_service_status'
                ]
            });
        });

        // Server info endpoint
        this.app.get('/info', (req, res) => {
            res.json({
                name: 'iplan-israel-planning',
                version: '1.0.0',
                description: 'שרת MCP למינהל התכנון הישראלי',
                capabilities: {
                    tools: {}
                },
                protocolVersion: '2024-11-05'
            });
        });

        // SSE endpoint for n8n MCP Client Tool
        this.app.use('/sse', (req, res, next) => {
            // Set SSE headers
            res.writeHead(200, {
                'Content-Type': 'text/event-stream',
                'Cache-Control': 'no-cache',
                'Connection': 'keep-alive',
                'Access-Control-Allow-Origin': '*',
                'Access-Control-Allow-Headers': 'Cache-Control'
            });

            const transport = new SSEServerTransport('/sse', res);
            
            // Connect the MCP server to the SSE transport
            this.server.connect(transport).catch(error => {
                console.error('SSE connection error:', error);
                res.end();
            });

            // Handle client disconnect
            req.on('close', () => {
                console.log('SSE client disconnected');
            });
        });

        // Error handling
        this.app.use((error, req, res, next) => {
            console.error('Express error:', error);
            res.status(500).json({
                error: 'Internal server error',
                message: error.message
            });
        });
    }

    setupToolHandlers() {
        this.server.setRequestHandler(ListToolsRequestSchema, async () => {
            return {
                tools: [
                    {
                        name: 'search_plans',
                        description: 'חיפוש תכניות במינהל התכנון הישראלי עם פילטרים מתקדמים',
                        inputSchema: {
                            type: 'object',
                            properties: {
                                searchTerm: {
                                    type: 'string',
                                    description: 'שם או מספר תכנית לחיפוש'
                                },
                                district: {
                                    type: 'string',
                                    description: 'מחוז (תל אביב, ירושלים, חיפה, מחוז הצפון, מחוז המרכז, מחוז הדרום)'
                                },
                                minArea: {
                                    type: 'number',
                                    description: 'שטח מינימלי בדונמים'
                                },
                                maxArea: {
                                    type: 'number',
                                    description: 'שטח מקסימלי בדונמים'
                                },
                                planAreaName: {
                                    type: 'string',
                                    description: 'אזור תכנית פנימי (לדוגמה: ירושלים מערב)'
                                },
                                cityName: {
                                    type: 'string',
                                    description: 'שם עיר או אזור סמכות (לדוגמה: עיריית תל אביב)'
                                },
                                landUse: {
                                    type: 'string',
                                    description: 'ייעוד קרקע (מגורים, מסחר, תעשיה, וכו\')'
                                },
                                minDate: {
                                    type: 'string',
                                    description: 'תאריך אישור מינימלי (YYYY-MM-DD)'
                                },
                                maxDate: {
                                    type: 'string',
                                    description: 'תאריך אישור מקסימלי (YYYY-MM-DD)'
                                },
                                limit: {
                                    type: 'number',
                                    description: 'מספר מקסימלי של תוצאות (ברירת מחדל: 50)',
                                    default: 50
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
                                    description: 'מספר התכנית הרשמי'
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
                                    description: 'קואורדינטת X (מערכת ישראל TM)'
                                },
                                y: {
                                    type: 'number',
                                    description: 'קואורדינטת Y (מערכת ישראל TM)'
                                },
                                radius: {
                                    type: 'number',
                                    description: 'רדיוס חיפוש במטרים (ברירת מחדל: 500)',
                                    default: 500
                                }
                            },
                            required: ['x', 'y']
                        }
                    },
                    {
                        name: 'get_building_restrictions',
                        description: 'קבלת הגבלות בנייה לפי מיקום',
                        inputSchema: {
                            type: 'object',
                            properties: {
                                x: {
                                    type: 'number',
                                    description: 'קואורדינטת X'
                                },
                                y: {
                                    type: 'number',
                                    description: 'קואורדינטת Y'
                                },
                                buffer: {
                                    type: 'number',
                                    description: 'רדיוס חיפוש במטרים',
                                    default: 100
                                }
                            },
                            required: ['x', 'y']
                        }
                    },
                    {
                        name: 'get_infrastructure_data',
                        description: 'קבלת מידע על תשתיות (דרכים, רכבות, גז)',
                        inputSchema: {
                            type: 'object',
                            properties: {
                                infrastructureType: {
                                    type: 'string',
                                    description: 'סוג תשתית: roads, trains, gas, all',
                                    enum: ['roads', 'trains', 'gas', 'all'],
                                    default: 'all'
                                },
                                whereClause: {
                                    type: 'string',
                                    description: 'תנאי מתקדם לחיפוש (SQL WHERE clause)',
                                    default: '1=1'
                                }
                            }
                        }
                    },
                    {
                        name: 'get_conservation_sites',
                        description: 'חיפוש אתרי שימור והגנה',
                        inputSchema: {
                            type: 'object',
                            properties: {
                                x: {
                                    type: 'number',
                                    description: 'קואורדינטת X (אופציונלי)'
                                },
                                y: {
                                    type: 'number',
                                    description: 'קואורדינטת Y (אופציונלי)'
                                },
                                radius: {
                                    type: 'number',
                                    description: 'רדיוס חיפוש במטרים',
                                    default: 1000
                                },
                                conservationGrade: {
                                    type: 'string',
                                    description: 'דרגת שימור (א, ב, ג)'
                                }
                            }
                        }
                    },
                    {
                        name: 'get_comprehensive_location_data',
                        description: 'קבלת מידע מקיף על מיקום - תכניות, הגבלות ואתרי שימור',
                        inputSchema: {
                            type: 'object',
                            properties: {
                                x: {
                                    type: 'number',
                                    description: 'קואורדינטת X'
                                },
                                y: {
                                    type: 'number',
                                    description: 'קואורדינטת Y'
                                },
                                radius: {
                                    type: 'number',
                                    description: 'רדיוס חיפוש במטרים',
                                    default: 500
                                }
                            },
                            required: ['x', 'y']
                        }
                    },
                    {
                        name: 'check_service_status',
                        description: 'בדיקת זמינות השירותים של מינהל התכנון',
                        inputSchema: {
                            type: 'object',
                            properties: {}
                        }
                    }
                ]
            };
        });

        // Handle tool calls
        this.server.setRequestHandler(CallToolRequestSchema, async (request) => {
            const { name, arguments: args } = request.params;
            try {
                switch (name) {
                    case 'search_plans':
                        return await this.searchPlans(args);
                    case 'get_plan_details':
                        return await this.getPlanDetails(args?.planNumber);
                    case 'search_by_location':
                        return await this.searchByLocation(args?.x, args?.y, args?.radius);
                    case 'get_building_restrictions':
                        return await this.getBuildingRestrictions(args?.x, args?.y, args?.buffer);
                    case 'get_infrastructure_data':
                        return await this.getInfrastructureData(args?.infrastructureType, args?.whereClause);
                    case 'get_conservation_sites':
                        return await this.getConservationSites(args);
                    case 'get_comprehensive_location_data':
                        return await this.getComprehensiveLocationData(args?.x, args?.y, args?.radius);
                    case 'check_service_status':
                        return await this.checkServiceStatus();
                    default:
                        throw new McpError(ErrorCode.MethodNotFound, `Unknown tool: ${name}`);
                }
            } catch (error) {
                if (error instanceof McpError) {
                    throw error;
                }
                throw new McpError(ErrorCode.InternalError, `Tool execution failed: ${error instanceof Error ? error.message : String(error)}`);
            }
        });
    }

    buildWhereClause(params) {
        const conditions = [];
        
        if (params.searchTerm) {
            conditions.push(`(pl_name LIKE '%${params.searchTerm}%' OR pl_number LIKE '%${params.searchTerm}%')`);
        }
        if (params.district) {
            conditions.push(`district_name LIKE '%${params.district}%'`);
        }
        if (params.planAreaName) {
            conditions.push(`plan_area_name LIKE '%${params.planAreaName}%'`);
        }
        if (params.cityName) {
            conditions.push(`jurstiction_area_name LIKE '%${params.cityName}%'`);
        }
        if (params.landUse) {
            conditions.push(`pl_landuse_string LIKE '%${params.landUse}%'`);
        }
        if (params.minArea) {
            conditions.push(`pl_area_dunam >= ${params.minArea}`);
        }
        if (params.maxArea) {
            conditions.push(`pl_area_dunam <= ${params.maxArea}`);
        }
        if (params.minDate) {
            conditions.push(`pl_date_8 >= '${params.minDate}'`);
        }
        if (params.maxDate) {
            conditions.push(`pl_date_8 <= '${params.maxDate}'`);
        }

        return conditions.length > 0 ? conditions.join(' AND ') : '1=1';
    }

    async searchPlans(params = {}) {
        const whereClause = this.buildWhereClause(params);
        const url = `${BASE_URL}/PlanningPublic/Xplan/MapServer/1/query`;
        const searchParams = new URLSearchParams({
            'where': whereClause,
            'outFields': 'pl_name,pl_number,district_name,plan_area_name,pl_area_dunam,pl_date_8,pl_url,jurstiction_area_name,pl_landuse_string',
            'f': 'json',
            'returnGeometry': 'false',
            'resultRecordCount': params.limit || '50'
        });

        const response = await fetch(`${url}?${searchParams}`, {
            method: 'GET',
            headers: { 'Accept': 'application/json' }
        });

        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }

        const data = await response.json();
        if (data?.error) {
            throw new Error(`API Error: ${data.error.message}`);
        }

        const results = data?.features || [];
        return {
            content: [
                {
                    type: 'text',
                    text: `נמצאו ${results.length} תוצאות:\n\n${JSON.stringify(results, null, 2)}`
                }
            ]
        };
    }

    async getPlanDetails(planNumber) {
        if (!planNumber) {
            throw new McpError(ErrorCode.InvalidParams, 'Plan number is required');
        }

        const url = `${BASE_URL}/PlanningPublic/Xplan/MapServer/1/query`;
        const searchParams = new URLSearchParams({
            'where': `pl_number = '${planNumber}'`,
            'outFields': '*',
            'f': 'json',
            'returnGeometry': 'true'
        });

        const response = await fetch(`${url}?${searchParams}`, {
            method: 'GET',
            headers: { 'Accept': 'application/json' }
        });

        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }

        const data = await response.json();
        if (data?.error) {
            throw new Error(`API Error: ${data.error.message}`);
        }

        const results = data?.features || [];
        if (results.length === 0) {
            return {
                content: [
                    {
                        type: 'text',
                        text: `לא נמצאה תכנית עם מספר: ${planNumber}`
                    }
                ]
            };
        }

        return {
            content: [
                {
                    type: 'text',
                    text: `פרטי תכנית ${planNumber}:\n\n${JSON.stringify(results[0], null, 2)}`
                }
            ]
        };
    }

    async searchByLocation(x, y, radius = 500) {
        if (!x || !y) {
            throw new McpError(ErrorCode.InvalidParams, 'X and Y coordinates are required');
        }

        const url = `${BASE_URL}/PlanningPublic/Xplan/MapServer/1/query`;
        const searchParams = new URLSearchParams({
            'geometry': `${x},${y}`,
            'geometryType': 'esriGeometryPoint',
            'distance': radius.toString(),
            'units': 'esriSRUnit_Meter',
            'spatialRel': 'esriSpatialRelWithin',
            'outFields': 'pl_name,pl_number,district_name,plan_area_name,pl_area_dunam,pl_date_8,pl_url',
            'f': 'json',
            'returnGeometry': 'false'
        });

        const response = await fetch(`${url}?${searchParams}`, {
            method: 'GET',
            headers: { 'Accept': 'application/json' }
        });

        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }

        const data = await response.json();
        if (data?.error) {
            throw new Error(`API Error: ${data.error.message}`);
        }

        const results = data?.features || [];
        return {
            content: [
                {
                    type: 'text',
                    text: `נמצאו ${results.length} תכניות ברדיוס ${radius} מטר מהנקודה (${x}, ${y}):\n\n${JSON.stringify(results, null, 2)}`
                }
            ]
        };
    }

    async getBuildingRestrictions(x, y, buffer = 100) {
        if (!x || !y) {
            throw new McpError(ErrorCode.InvalidParams, 'X and Y coordinates are required');
        }

        const url = `${BASE_URL}/PlanningPublic/Xplan/MapServer/8/query`;
        const searchParams = new URLSearchParams({
            'geometry': `${x},${y}`,
            'geometryType': 'esriGeometryPoint',
            'distance': buffer.toString(),
            'units': 'esriSRUnit_Meter',
            'spatialRel': 'esriSpatialRelWithin',
            'outFields': '*',
            'f': 'json',
            'returnGeometry': 'true'
        });

        const response = await fetch(`${url}?${searchParams}`, {
            method: 'GET',
            headers: { 'Accept': 'application/json' }
        });

        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }

        const data = await response.json();
        if (data?.error) {
            throw new Error(`API Error: ${data.error.message}`);
        }

        const results = data?.features || [];
        return {
            content: [
                {
                    type: 'text',
                    text: `נמצאו ${results.length} הגבלות בנייה ברדיוס ${buffer} מטר מהנקודה (${x}, ${y}):\n\n${JSON.stringify(results, null, 2)}`
                }
            ]
        };
    }

    async getInfrastructureData(infrastructureType = 'all', whereClause = '1=1') {
        const layerMap = {
            'roads': 12,
            'trains': 13,
            'gas': 14
        };

        const layers = infrastructureType === 'all' ? 
            Object.values(layerMap) : 
            [layerMap[infrastructureType]];

        if (!layers[0] && infrastructureType !== 'all') {
            throw new McpError(ErrorCode.InvalidParams, 'Invalid infrastructure type');
        }

        const results = [];
        for (const layer of layers) {
            const url = `${BASE_URL}/PlanningPublic/Xplan/MapServer/${layer}/query`;
            const searchParams = new URLSearchParams({
                'where': whereClause,
                'outFields': '*',
                'f': 'json',
                'returnGeometry': 'false',
                'resultRecordCount': '20'
            });

            try {
                const response = await fetch(`${url}?${searchParams}`, {
                    method: 'GET',
                    headers: { 'Accept': 'application/json' }
                });

                if (response.ok) {
                    const data = await response.json();
                    if (data?.features) {
                        results.push({
                            layer: layer,
                            type: Object.keys(layerMap).find(key => layerMap[key] === layer) || 'unknown',
                            features: data.features
                        });
                    }
                }
            } catch (error) {
                console.error(`Error fetching layer ${layer}:`, error);
            }
        }

        return {
            content: [
                {
                    type: 'text',
                    text: `מידע תשתיות:\n\n${JSON.stringify(results, null, 2)}`
                }
            ]
        };
    }

    async getConservationSites(params = {}) {
        const { x, y, radius = 1000, conservationGrade } = params;
        
        const url = `${BASE_URL}/PlanningPublic/Xplan/MapServer/10/query`;
        const searchParams = new URLSearchParams({
            'outFields': '*',
            'f': 'json',
            'returnGeometry': 'true',
            'resultRecordCount': '50'
        });

        let whereClause = '1=1';
        if (conservationGrade) {
            whereClause = `conservation_grade = '${conservationGrade}'`;
        }
        searchParams.append('where', whereClause);

        if (x && y) {
            searchParams.append('geometry', `${x},${y}`);
            searchParams.append('geometryType', 'esriGeometryPoint');
            searchParams.append('distance', radius.toString());
            searchParams.append('units', 'esriSRUnit_Meter');
            searchParams.append('spatialRel', 'esriSpatialRelWithin');
        }

        const response = await fetch(`${url}?${searchParams}`, {
            method: 'GET',
            headers: { 'Accept': 'application/json' }
        });

        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }

        const data = await response.json();
        if (data?.error) {
            throw new Error(`API Error: ${data.error.message}`);
        }

        const results = data?.features || [];
        return {
            content: [
                {
                    type: 'text',
                    text: `נמצאו ${results.length} אתרי שימור והגנה:\n\n${JSON.stringify(results, null, 2)}`
                }
            ]
        };
    }

    async getComprehensiveLocationData(x, y, radius = 500) {
        if (!x || !y) {
            throw new McpError(ErrorCode.InvalidParams, 'X and Y coordinates are required');
        }

        const results = {
            location: { x, y, radius },
            plans: [],
            restrictions: [],
            conservation: []
        };

        try {
            // Get plans
            const plansResponse = await this.searchByLocation(x, y, radius);
            results.plans = JSON.parse(plansResponse.content[0].text.split(':\n\n')[1]);
        } catch (error) {
            results.plans_error = error.message;
        }

        try {
            // Get building restrictions
            const restrictionsResponse = await this.getBuildingRestrictions(x, y, radius);
            results.restrictions = JSON.parse(restrictionsResponse.content[0].text.split(':\n\n')[1]);
        } catch (error) {
            results.restrictions_error = error.message;
        }

        try {
            // Get conservation sites
            const conservationResponse = await this.getConservationSites({ x, y, radius });
            results.conservation = JSON.parse(conservationResponse.content[0].text.split(':\n\n')[1]);
        } catch (error) {
            results.conservation_error = error.message;
        }

        return {
            content: [
                {
                    type: 'text',
                    text: `מידע מקיף על מיקום (${x}, ${y}):\n\n${JSON.stringify(results, null, 2)}`
                }
            ]
        };
    }

    async checkServiceStatus() {
        const testUrl = `${BASE_URL}/PlanningPublic/Xplan/MapServer?f=json`;
        
        try {
            const response = await fetch(testUrl, {
                method: 'GET',
                headers: { 'Accept': 'application/json' },
                timeout: 5000
            });

            const data = await response.json();
            
            return {
                content: [
                    {
                        type: 'text',
                        text: `סטטוס שירותי מינהל התכנון: ${response.ok ? 'זמין' : 'לא זמין'}\n\nפרטים:\n${JSON.stringify(data, null, 2)}`
                    }
                ]
            };
        } catch (error) {
            return {
                content: [
                    {
                        type: 'text',
                        text: `שגיאה בבדיקת סטטוס השירות: ${error.message}`
                    }
                ]
            };
        }
    }

    async runStdio() {
        // Run as stdio server (for CLI usage)
        const transport = new StdioServerTransport();
        await this.server.connect(transport);
        console.error('Iplan MCP Server running on stdio');
    }

    async runHTTP(port = 3000, host = '0.0.0.0') {
        // Run as HTTP server with SSE support (for n8n)
        this.httpServer = this.app.listen(port, host, () => {
            console.log(`🚀 Iplan MCP Server running on http://${host}:${port}`);
            console.log(`📊 Health check: http://${host}:${port}/`);
            console.log(`🔗 SSE endpoint for n8n: http://${host}:${port}/sse`);
            console.log(`ℹ️  Server info: http://${host}:${port}/info`);
        });

        // Graceful shutdown
        process.on('SIGTERM', () => {
            console.log('Received SIGTERM, shutting down gracefully...');
            this.httpServer?.close(() => {
                console.log('HTTP server closed.');
                process.exit(0);
            });
        });

        process.on('SIGINT', () => {
            console.log('Received SIGINT, shutting down gracefully...');
            this.httpServer?.close(() => {
                console.log('HTTP server closed.');
                process.exit(0);
            });
        });

        return this.httpServer;
    }
}

// Command line interface
async function main() {
    const server = new IplanMCPServer();
    
    // Check command line arguments
    const args = process.argv.slice(2);
    const mode = args[0] || 'stdio';
    
    if (mode === 'http' || mode === 'sse') {
        const port = parseInt(args[1]) || 3000;
        const host = args[2] || '0.0.0.0';
        await server.runHTTP(port, host);
    } else {
        await server.runStdio();
    }
}

// Export for module usage
export { IplanMCPServer };

// Run if called directly
if (import.meta.url === `file://${process.argv[1]}`) {
    main().catch(console.error);
}

/*
Usage Examples:

1. For CLI/stdio usage:
   node server.js

2. For n8n SSE usage:
   node server.js http 3000
   
   Then in n8n MCP Client Tool:
   SSE Endpoint: http://localhost:3000/sse

3. For custom port/host:
   node server.js http 3001 localhost

Dependencies needed:
npm install @modelcontextprotocol/sdk express cors node-fetch
*/