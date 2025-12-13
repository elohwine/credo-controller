import React from 'react';
import Button from '../walt/button/Button';

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

const WorkflowList: React.FC<WorkflowListProps> = ({ workflows, onSelect }) => {
    // Group by category
    const grouped = workflows.reduce((acc, wf) => {
        if (!acc[wf.category]) acc[wf.category] = [];
        acc[wf.category].push(wf);
        return acc;
    }, {} as Record<string, Workflow[]>);

    if (workflows.length === 0) {
        return (
            <div className="text-center py-12 bg-gray-50 rounded-lg border-2 border-dashed border-gray-300">
                <p className="text-gray-500 text-lg">No workflows available.</p>
            </div>
        );
    }

    return (
        <div className="space-y-8">
            {Object.entries(grouped).map(([category, items]) => (
                <div key={category} className="space-y-4">
                    <h2 className="text-2xl font-bold text-gray-900 border-b pb-2">{category}</h2>
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                        {items.map((wf) => (
                            <div key={wf.id} className="bg-white rounded-lg border border-gray-200 shadow-sm hover:shadow-md transition-shadow p-5">
                                <div className="flex justify-between items-start">
                                    <div>
                                        <h3 className="text-lg font-semibold text-gray-900">{wf.name}</h3>
                                        <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-blue-100 text-blue-800 mt-1">
                                            {wf.provider}
                                        </span>
                                    </div>
                                </div>
                                <p className="mt-2 text-sm text-gray-600 line-clamp-2">{wf.description}</p>
                                <div className="mt-4">
                                    <Button size="sm" onClick={() => onSelect(wf)}>
                                        Select Workflow
                                    </Button>
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
