import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { format } from "date-fns";
import { Loader2, RefreshCw, Mail, MailX, MailCheck } from "lucide-react";

type SovereignRow = {
  id: string;
  applicant_name: string;
  fund_name: string;
  aum_bracket: string;
  contact_email: string;
  status: string;
  created_at: string;
  email_sent_at: string | null;
  email_error: string | null;
  email_message_id: string | null;
};

const SovereignApplications = () => {
  const [rows, setRows] = useState<SovereignRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [resending, setResending] = useState<string | null>(null);

  const load = async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from("sovereign_applications" as any)
      .select("id, applicant_name, fund_name, aum_bracket, contact_email, status, created_at, email_sent_at, email_error, email_message_id")
      .order("created_at", { ascending: false });
    if (!error && data) setRows(data as unknown as SovereignRow[]);
    setLoading(false);
  };

  useEffect(() => { load(); }, []);

  const resend = async (id: string) => {
    setResending(id);
    try {
      await supabase.functions.invoke("notify-sovereign-application", {
        body: { application_id: id },
      });
    } finally {
      setResending(null);
      load();
    }
  };

  return (
    <div>
      <div className="flex items-center justify-between mb-3">
        <h2 className="text-xs uppercase tracking-wider text-muted-foreground">
          Sovereign Titan Applications ({rows.length})
        </h2>
        <button
          onClick={load}
          className="flex items-center gap-1 border border-border px-2 py-1 text-[10px] uppercase tracking-wider text-muted-foreground hover:text-primary"
        >
          <RefreshCw className="h-3 w-3" /> Refresh
        </button>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-8">
          <Loader2 className="h-4 w-4 animate-spin text-primary" />
        </div>
      ) : rows.length === 0 ? (
        <div className="border border-border bg-card p-6 text-center text-xs text-muted-foreground">
          No sovereign applications yet.
        </div>
      ) : (
        <div className="border border-border bg-card overflow-x-auto">
          <table className="w-full text-xs">
            <thead className="border-b border-border bg-background/50">
              <tr className="text-left text-[10px] uppercase tracking-wider text-muted-foreground">
                <th className="p-2">Submitted</th>
                <th className="p-2">Name</th>
                <th className="p-2">Fund</th>
                <th className="p-2">AUM</th>
                <th className="p-2">Contact</th>
                <th className="p-2">Status</th>
                <th className="p-2">Email</th>
                <th className="p-2">Actions</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id} className="border-b border-border last:border-b-0">
                  <td className="p-2 font-data text-muted-foreground whitespace-nowrap">
                    {format(new Date(r.created_at), "yyyy-MM-dd HH:mm")}
                  </td>
                  <td className="p-2 font-bold text-foreground">{r.applicant_name}</td>
                  <td className="p-2 text-foreground">{r.fund_name}</td>
                  <td className="p-2 font-data text-primary">{r.aum_bracket}</td>
                  <td className="p-2 text-muted-foreground">{r.contact_email}</td>
                  <td className="p-2 uppercase tracking-wider text-[10px]">{r.status}</td>
                  <td className="p-2">
                    {r.email_sent_at ? (
                      <div className="flex items-center gap-1 text-terminal-green" title={r.email_message_id ?? ""}>
                        <MailCheck className="h-3 w-3" />
                        <span className="font-data text-[10px]">
                          {format(new Date(r.email_sent_at), "MM-dd HH:mm")}
                        </span>
                      </div>
                    ) : r.email_error ? (
                      <div className="flex items-center gap-1 text-destructive" title={r.email_error}>
                        <MailX className="h-3 w-3" />
                        <span className="text-[10px]">Failed</span>
                      </div>
                    ) : (
                      <div className="flex items-center gap-1 text-muted-foreground">
                        <Mail className="h-3 w-3" />
                        <span className="text-[10px]">Not sent</span>
                      </div>
                    )}
                    {r.email_error && (
                      <div className="mt-1 text-[10px] text-destructive/80 max-w-[200px] truncate" title={r.email_error}>
                        {r.email_error}
                      </div>
                    )}
                  </td>
                  <td className="p-2">
                    <button
                      onClick={() => resend(r.id)}
                      disabled={resending === r.id}
                      className="border border-primary bg-primary/10 px-2 py-1 text-[10px] uppercase tracking-wider text-primary hover:bg-primary/20 disabled:opacity-50"
                    >
                      {resending === r.id ? "Sending..." : r.email_sent_at ? "Resend" : "Send"}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
};

export default SovereignApplications;
