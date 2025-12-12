import { IssueForm } from '@/components/debenture/IssueForm'

export default function IssuePage() {
  return (
    <main className="container mx-auto px-4 py-8">
      <div className="mb-8">
        <h1 className="text-4xl font-bold mb-2 text-gray-900">
          Issue Debenture
        </h1>
        <p className="text-gray-600">
          Create a new Brazilian tokenized debenture with oracle-indexed rates
        </p>
      </div>

      <IssueForm />
    </main>
  )
}
