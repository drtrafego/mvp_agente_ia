export interface CRMActionOverrides {
    updateLeadStatus?: (id: string, newColumnId: string, newPosition: number, orgId: string) => Promise<void>;
    updateColumnOrder?: (orderedIds: string[], orgId: string) => Promise<{ success: boolean; columns: any[] }>;
    createColumn?: (title: string, orgId: string) => Promise<void>;
    updateColumn?: (id: string, title: string, orgId: string) => Promise<void>;
    deleteColumn?: (id: string, orgId: string) => Promise<void>;
    createLead?: (formData: FormData, orgId: string) => Promise<void>;
    updateLeadContent?: (id: string, data: any, orgId: string) => Promise<void>;
    deleteLead?: (id: string, orgId: string) => Promise<void>;
    getHistory?: (leadId: string) => Promise<any[]>;
}
