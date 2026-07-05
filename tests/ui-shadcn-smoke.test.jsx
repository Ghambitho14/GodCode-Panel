import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Separator } from '@/components/ui/separator';
import { Skeleton } from '@/components/ui/skeleton';

describe('shadcn/ui smoke test', () => {
	it('renders Button', () => {
		render(<Button variant="default">Click me</Button>);
		expect(screen.getByText('Click me')).not.toBeNull();
	});

	it('renders Card', () => {
		render(
			<Card>
				<CardHeader>
					<CardTitle>Title</CardTitle>
				</CardHeader>
				<CardContent>Content</CardContent>
			</Card>,
		);
		expect(screen.getByText('Title')).not.toBeNull();
		expect(screen.getByText('Content')).not.toBeNull();
	});

	it('renders Badge', () => {
		render(<Badge>Badge</Badge>);
		expect(screen.getByText('Badge')).not.toBeNull();
	});

	it('renders Tabs', () => {
		render(
			<Tabs value="all">
				<TabsList>
					<TabsTrigger value="all">All</TabsTrigger>
					<TabsTrigger value="store">Store</TabsTrigger>
				</TabsList>
			</Tabs>,
		);
		expect(screen.getByText('All')).not.toBeNull();
	});

	it('renders Separator and Skeleton', () => {
		render(
			<div>
				<Separator />
				<Skeleton data-testid="skeleton" />
			</div>,
		);
		expect(screen.getByTestId('skeleton')).not.toBeNull();
	});
});
