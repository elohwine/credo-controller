import React from 'react';
import { BRAND } from '@/lib/theme';
import { CogIcon, PlayIcon, FolderIcon } from '@heroicons/react/24/outline';

interface Workflow {
    id: string;
    name: string;
    category: string;
    description: string;
    provider: string;
}

interface WorkflowListProps {
    workflows: Workflow[];
    onSelect: (workflow: Workflow) => void;
}

const WorkflowList: React.FC<WorkflowListProps> = ({ workflows = [], onSelect }) => {
    // Safety check: ensure workflows is an array
    const workflowsArray = Array.isArray(workflows) ? workflows : [];
    
    // Group by category
    const grouped = workflowsArray.reduce((acc, wf) => {
        if (!acc[wf.category]) acc[wf.category] = [];
        acc[wf.category].push(wf);
        return acc;
    }, {} as Record<string, Workflow[]>);

    if (workflowsArray.length === 0) {
        return (
            <div className="text-center py-12 rounded-xl" style={{ backgroundColor: BRAND.linkWater }}>
                <CogIcon className="h-12 w-12 mx-auto mb-3" style={{ color: BRAND.viking }} />
                <p className="text-lg" style={{ color: BRAND.dark }}>No workflows available.</p>
                <p className="text-sm text-gray-500 mt-1">Workflows will appear here once configured.</p>
            </div>
        );
    }

    return (
        <div className="space-y-8">
            {Object.entries(grouped).map(([category, items]) => (
                <div key={category} className="space-y-4">
                    <div className="flex items-center gap-3 border-b pb-3" style={{ borderColor: BRAND.linkWater }}>
                        <FolderIcon className="h-6 w-6" style={{ color: BRAND.curious }} />
                        <h2 className="text-xl font-bold" style={{ color: BRAND.dark }}>{category}</h2>
                        <span className="text-sm text-gray-500">({items.length} workflows)</span>
                    </div>
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                        {items.map((wf) => (
                            <div
                                key={wf.id}
                                className="bg-white rounded-xl overflow-hidden shadow-sm hover:shadow-md transition-all border border-gray-100 group"
                            >
                                <div className="p-5">
                                    <div className="flex justify-between items-start">
                                        <div className="flex items-start gap-3">
                                            <div className="p-2 rounded-lg" style={{ backgroundColor: BRAND.linkWater }}>
                                                <CogIcon className="h-5 w-5" style={{ color: BRAND.curious }} />
                                            </div>
                                            <div>
                                                <h3 className="text-lg font-semibold" style={{ color: BRAND.dark }}>{wf.name}</h3>
                                                <span
                                                    className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium mt-1"
                                                    style={{ backgroundColor: BRAND.linkWater, color: BRAND.curious }}
                                                >
                                                    {wf.provider}
                                                </span>
                                            </div>
                                        </div>
                                    </div>
                                    <p className="mt-3 text-sm text-gray-600 line-clamp-2">{wf.description}</p>
                                </div>
                                <div className="px-5 py-3" style={{ backgroundColor: BRAND.linkWater + '50' }}>
                                    <button
                                        onClick={() => onSelect(wf)}
                                        className="inline-flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-medium text-white transition-all hover:shadow-md w-full justify-center"
                                        style={{ backgroundColor: BRAND.curious }}
                                    >
                                        <PlayIcon className="h-4 w-4" />
                                        Select Workflow
                                    </button>
                                </div>
                            </div>
                        ))}
                    </div>
                </div>
            ))}
        </div>
    );
};

export default WorkflowList;
