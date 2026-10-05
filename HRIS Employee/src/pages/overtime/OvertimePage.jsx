import React, { useState, useEffect, useRef, useCallback } from "react";
import {
  Container,
  Row,
  Col,
  Card,
  Button,
  Modal,
  Form,
  Alert,
  Table,
  Spinner,
} from "react-bootstrap";
import { useNavigate } from "react-router-dom";
import AdminLayout from "@/components/layout/Adminlayout";
import { PlusCircle, ClockHistory } from "react-bootstrap-icons";
import { useAuth } from "@/context/AuthContext";
import "@/pages/leave/Leave.css";
import "@/pages/overtime/OvertimePage.css";
import api from "@/config/axios";
import "@/assets/style/global.css";

const ROWS_PER_PAGE = 10;

const HOUR_OPTIONS = Array.from({ length: 24 }, (_, h) => {
  const label = new Date(2000, 0, 1, h, 0, 0).toLocaleTimeString("en-US", {
    hour: "numeric",
    hour12: true,
  });
  return { value: `${String(h).padStart(2, "0")}:00`, label };
});

const calcHours = (startTime, endTime) => {
  if (!startTime || !endTime) return 0;
  const [sh] = startTime.split(":").map(Number);
  const [eh] = endTime.split(":").map(Number);
  if (Number.isNaN(sh) || Number.isNaN(eh)) return 0;
  const diffHours = eh - sh;
  if (diffHours <= 0) return 0;
  return diffHours;
};

const OvertimePage = ({ setIsAuth }) => {
  const { isAuth } = useAuth();
  const navigate = useNavigate();

  // State Management
  const [requests, setRequests] = useState([]);
  const [loading, setLoading] = useState(true);
  const [summaryLoading, setSummaryLoading] = useState(false);
  const [summary, setSummary] = useState({
    total: 0,
    pending: 0,
    approved: 0,
    totalHours: 0,
  });
  const [error, setError] = useState(null);
  const [success, setSuccess] = useState(null);
  const [submitting, setSubmitting] = useState(false);
  const [cancellingId, setCancellingId] = useState(null);

  // Modals
  const [showModal, setShowModal] = useState(false);
  const [showCancelModal, setShowCancelModal] = useState(false);
  const [selectedRequest, setSelectedRequest] = useState(null);

  // Pagination
  const [currentPage, setCurrentPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [totalRequests, setTotalRequests] = useState(0);

  const hasFetched = useRef(false);

  // Form State
  const [formData, setFormData] = useState({
    overtime_date: "",
    start_time: "",
    end_time: "",
    reason: "",
  });

  const calculatedHours = calcHours(formData.start_time, formData.end_time);
  const todayStr = new Date().toISOString().split("T")[0];

  // Fetch paginated overtime requests
  const fetchRequests = useCallback(async (page = 1) => {
    try {
      setLoading(true);
      const response = await api.get("/overtime/my-requests", {
        params: { per_page: ROWS_PER_PAGE, page },
      });
      if (response.data.isSuccess) {
        setRequests(response.data.data || []);
        const pagination = response.data.pagination || {};
        setTotalRequests(pagination.total ?? 0);
        setTotalPages(pagination.last_page ?? 1);
        setCurrentPage(pagination.current_page ?? page);
      }
      setError(null);
    } catch (err) {
      setError("Failed to fetch overtime requests");
      console.error(err);
    } finally {
      setLoading(false);
    }
  }, []);

  // Fetch summary across all requests (single lightweight call)
  const fetchSummary = useCallback(async () => {
    try {
      setSummaryLoading(true);
      const response = await api.get("/overtime/my-requests", {
        params: { per_page: 100, page: 1 },
      });
      if (response.data.isSuccess) {
        const all = response.data.data || [];
        const pagination = response.data.pagination || {};
        setSummary({
          total: pagination.total ?? all.length,
          pending: all.filter((r) => r.status === "Pending").length,
          approved: all.filter((r) => r.status === "Approved").length,
          totalHours: Math.round(
            all
              .filter((r) => r.status === "Approved")
              .reduce((sum, r) => sum + (Number(r.total_hours) || 0), 0),
          ),
        });
      }
    } catch (err) {
      console.error("Failed to fetch overtime summary:", err);
    } finally {
      setSummaryLoading(false);
    }
  }, []);

  // Initial fetch
  useEffect(() => {
    if (hasFetched.current) return;
    hasFetched.current = true;
    fetchRequests(1);
    fetchSummary();
  }, [fetchRequests, fetchSummary]);

  const handlePageChange = (page) => {
    setCurrentPage(page);
    fetchRequests(page);
  };

  // Redirect to login if not authenticated
  useEffect(() => {
    if (!isAuth) {
      if (setIsAuth) setIsAuth(false);
      navigate("/");
      return;
    }
  }, [isAuth, navigate, setIsAuth]);

  // Handle form input changes
  const handleFormChange = (e) => {
    const { name, value } = e.target;
    setFormData((prev) => ({
      ...prev,
      [name]: value,
    }));
  };

  const resetForm = () => {
    setFormData({
      overtime_date: "",
      start_time: "",
      end_time: "",
      reason: "",
    });
  };

  // Submit overtime request
  const handleSubmitRequest = async (e) => {
    e.preventDefault();
    setError(null);
    setSuccess(null);

    if (!formData.overtime_date || !formData.start_time || !formData.end_time) {
      setError("Please fill in the date, start time, and end time.");
      return;
    }

    if (calculatedHours <= 0) {
      setError("End time must be later than start time.");
      return;
    }

    try {
      setSubmitting(true);
      const response = await api.post("/overtime/request", {
        overtime_date: formData.overtime_date,
        start_time: formData.start_time,
        end_time: formData.end_time,
        reason: formData.reason || null,
      });

      if (response.data.isSuccess) {
        setSuccess(response.data.message || "Overtime request submitted successfully.");
        resetForm();
        setTimeout(() => {
          setShowModal(false);
          setSuccess(null);
          fetchRequests(1);
          setCurrentPage(1);
          fetchSummary();
        }, 1500);
      } else {
        setError(response.data.message || "Failed to submit overtime request.");
      }
    } catch (err) {
      if (err.response?.data?.errors) {
        const firstError = Object.values(err.response.data.errors).flat()[0];
        setError(firstError || err.response.data.message || "Invalid data submitted.");
      } else {
        setError(err.response?.data?.message || "Failed to submit overtime request.");
      }
      console.error(err);
    } finally {
      setSubmitting(false);
    }
  };

  // Cancel overtime request
  const openCancelModal = (request) => {
    setSelectedRequest(request);
    setShowCancelModal(true);
  };

  const handleCancelRequest = async () => {
    if (!selectedRequest) return;
    setError(null);
    try {
      setCancellingId(selectedRequest.id);
      const response = await api.post(`/overtime/${selectedRequest.id}/cancel`);
      if (response.data.isSuccess) {
        setShowCancelModal(false);
        setSelectedRequest(null);
        fetchRequests(currentPage);
        fetchSummary();
      } else {
        setError(response.data.message || "Failed to cancel overtime request.");
      }
    } catch (err) {
      setError(err.response?.data?.message || "Failed to cancel overtime request.");
      console.error(err);
    } finally {
      setCancellingId(null);
    }
  };

  // Helpers
  const getStatusBadge = (status) => {
    const normalized = status?.toLowerCase() || "pending";
    switch (normalized) {
      case "approved":
        return <span className="leave-status-badge approved">Approved</span>;
      case "pending":
        return <span className="leave-status-badge pending">Pending</span>;
      case "rejected":
        return <span className="leave-status-badge rejected">Rejected</span>;
      case "cancelled":
        return <span className="leave-status-badge overtime-cancelled">Cancelled</span>;
      default:
        return <span className="leave-status-badge">{status}</span>;
    }
  };

  const formatDate = (dateString) => {
    if (!dateString) return "-";
    // Backend may return "YYYY-MM-DD", "YYYY-MM-DD HH:MM:SS", or full ISO.
    // Slice the date part and construct locally to avoid Invalid Date / TZ shift.
    const datePart = String(dateString).slice(0, 10);
    const [y, m, d] = datePart.split("-").map(Number);
    if (!y || !m || !d) return "-";
    return new Date(y, m - 1, d).toLocaleDateString("en-US", {
      year: "numeric",
      month: "short",
      day: "numeric",
    });
  };

  const formatTime = (timeString) => {
    if (!timeString) return "-";
    const [h] = String(timeString).split(":");
    const hours = Number(h);
    if (Number.isNaN(hours)) return "-";
    const date = new Date();
    date.setHours(hours, 0, 0, 0);
    return date.toLocaleTimeString("en-US", {
      hour: "numeric",
      hour12: true,
    });
  };

  if (!isAuth) {
    return null;
  }

  if (loading) {
    return (
      <AdminLayout setIsAuth={setIsAuth}>
        <div className="loadingScreen">
          <div className="spinner-border text-primary" role="status">
            <span className="visually-hidden">Loading overtime...</span>
          </div>
          <p>Loading overtime information...</p>
        </div>
      </AdminLayout>
    );
  }

  return (
    <AdminLayout setIsAuth={setIsAuth}>
      <Container fluid className="glb-container">
        {/* Page Header */}
        <Row className="leave-header mb-4">
          <Col>
            <h1 className="leave-title">Overtime Management</h1>
            <p className="section-subtitle">
              File overtime requests and track their approval status
            </p>
          </Col>
          <Col className="text-end"></Col>
        </Row>

        {/* Summary Cards */}
        <Row className="leave-section mb-4">
          <Col md={12}>
            <div className="d-flex flex-wrap justify-content-between align-items-center mb-4">
              <div>
                <h5 className="section-title text-dark">Overtime Summary</h5>
                <p className="section-subtitle">
                  Your overtime overview across all requests
                </p>
              </div>
              <div>
                <Button
                  className="px-3"
                  size="sm"
                  onClick={() => {
                    setError(null);
                    setSuccess(null);
                    setShowModal(true);
                  }}
                >
                  <PlusCircle size={18} className="me-2" />
                  Request Overtime
                </Button>
              </div>
            </div>
          </Col>
          {summaryLoading ? (
            <Col md={12} className="text-center py-4">
              <Spinner animation="border" size="sm" role="status">
                <span className="visually-hidden">Loading summary...</span>
              </Spinner>
            </Col>
          ) : (
            <>
              <Col md={6} lg={3} className="mb-3">
                <Card className="dashboard-card-modern leave-balance-card h-100">
                  <Card.Body>
                    <h6 className="leave-balance-type mb-3">Total Requests</h6>
                    <div className="leave-balance-display">
                      <div className="balance-item">
                        <span className="balance-value-primary text-dark">
                          {summary.total}
                        </span>
                        <span className="balance-unit">requests</span>
                      </div>
                    </div>
                  </Card.Body>
                </Card>
              </Col>
              <Col md={6} lg={3} className="mb-3">
                <Card className="dashboard-card-modern leave-balance-card h-100">
                  <Card.Body>
                    <h6 className="leave-balance-type mb-3">Pending</h6>
                    <div className="leave-balance-display">
                      <div className="balance-item">
                        <span className="balance-value-primary text-dark">
                          {summary.pending}
                        </span>
                        <span className="balance-unit">awaiting approval</span>
                      </div>
                    </div>
                  </Card.Body>
                </Card>
              </Col>
              <Col md={6} lg={3} className="mb-3">
                <Card className="dashboard-card-modern leave-balance-card h-100">
                  <Card.Body>
                    <h6 className="leave-balance-type mb-3">Approved</h6>
                    <div className="leave-balance-display">
                      <div className="balance-item">
                        <span className="balance-value-primary text-dark">
                          {summary.approved}
                        </span>
                        <span className="balance-unit">requests</span>
                      </div>
                    </div>
                  </Card.Body>
                </Card>
              </Col>
              <Col md={6} lg={3} className="mb-3">
                <Card className="dashboard-card-modern leave-balance-card h-100">
                  <Card.Body>
                    <h6 className="leave-balance-type mb-3">Approved Hours</h6>
                    <div className="leave-balance-display">
                      <div className="balance-item">
                        <span className="balance-value-primary text-dark">
                          {summary.totalHours}
                        </span>
                        <span className="balance-unit">hours</span>
                      </div>
                    </div>
                  </Card.Body>
                </Card>
              </Col>
            </>
          )}
        </Row>

        {/* Overtime Requests Section */}
        <Row className="leave-section">
          <Col md={12}>
            <Card className="dashboard-card-modern leave-requests-card">
              <Card.Header className="card-header-custom">
                <div className="d-flex align-items-center justify-content-between gap-2">
                  <div>
                    <h5>Overtime Requests</h5>
                    <p className="section-subtitle mb-0">
                      View your overtime request history
                    </p>
                  </div>
                  <span className="leave-request-count">{totalRequests}</span>
                </div>
              </Card.Header>
              <Card.Body className="leave-requests-body">
                {error && (
                  <div className="p-3 pb-0">
                    <Alert variant="danger" className="mb-0">
                      {error}
                    </Alert>
                  </div>
                )}

                {requests.length > 0 ? (
                  <>
                    <Table borderless responsive className="dashboard-table leave-requests-table overtime-requests-table">
                      <thead>
                        <tr>
                          <th>Date</th>
                          <th>Time</th>
                          <th>Hours</th>
                          <th>Reason</th>
                          <th>Status</th>
                          <th className="text-end">Action</th>
                        </tr>
                      </thead>
                      <tbody>
                        {requests.map((request) => (
                          <tr key={request.id}>
                            <td>
                              <span className="leave-date">
                                {formatDate(request.overtime_date)}
                              </span>
                            </td>
                            <td>
                              <span className="overtime-time-range">
                                {formatTime(request.start_time)}
                                {" - "}
                                {formatTime(request.end_time)}
                              </span>
                            </td>
                            <td>
                              <span className="leave-days-pill">
                                {Math.round(Number(request.total_hours) || 0)} hrs
                              </span>
                            </td>
                            <td
                              className="leave-reason"
                              title={request.reason || ""}
                            >
                              {request.status === "Rejected" && request.rejection_reason ? (
                                <>
                                  {request.reason || (
                                    <span className="text-muted">No reason provided</span>
                                  )}
                                  <div className="overtime-rejection-reason">
                                    Rejected: {request.rejection_reason}
                                  </div>
                                </>
                              ) : (
                                request.reason || (
                                  <span className="text-muted">No reason provided</span>
                                )
                              )}
                            </td>
                            <td>{getStatusBadge(request.status)}</td>
                            <td className="text-end">
                              {request.status === "Pending" ? (
                                <Button
                                  variant="outline-danger"
                                  size="sm"
                                  disabled={cancellingId === request.id}
                                  onClick={() => openCancelModal(request)}
                                >
                                  {cancellingId === request.id ? (
                                    <>
                                      <span
                                        className="spinner-border spinner-border-sm me-1"
                                        role="status"
                                        aria-hidden="true"
                                      ></span>
                                      Cancelling...
                                    </>
                                  ) : (
                                    "Cancel"
                                  )}
                                </Button>
                              ) : (
                                <span className="text-muted">-</span>
                              )}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </Table>

                    {/* Pagination */}
                    {totalPages > 1 && (
                      <div className="d-flex justify-content-between align-items-center mt-4 pt-3 border-top px-3 pb-3 flex-wrap gap-2">
                        <div className="text-muted small">
                          Page {currentPage} of {totalPages} ({totalRequests} total
                          requests)
                        </div>
                        <div className="pagination-controls">
                          <Button
                            variant="outline-secondary"
                            size="sm"
                            disabled={currentPage === 1}
                            onClick={() => handlePageChange(currentPage - 1)}
                            className="me-2"
                          >
                            Previous
                          </Button>
                          <div className="d-inline-flex gap-1">
                            {Array.from({ length: totalPages }, (_, i) => i + 1).map(
                              (page) => (
                                <Button
                                  key={page}
                                  variant={
                                    currentPage === page ? "primary" : "outline-secondary"
                                  }
                                  size="sm"
                                  onClick={() => handlePageChange(page)}
                                  style={{ minWidth: "32px" }}
                                >
                                  {page}
                                </Button>
                              ),
                            )}
                          </div>
                          <Button
                            variant="outline-secondary"
                            size="sm"
                            disabled={currentPage === totalPages}
                            onClick={() => handlePageChange(currentPage + 1)}
                            className="ms-2"
                          >
                            Next
                          </Button>
                        </div>
                      </div>
                    )}
                  </>
                ) : (
                  <div className="leave-empty-state">
                    <div>
                      <ClockHistory size={40} className="text-muted mb-3" />
                      <p className="mb-2">No overtime requests found.</p>
                      <Button size="sm" onClick={() => setShowModal(true)}>
                        <PlusCircle size={16} className="me-2" />
                        File your first request
                      </Button>
                    </div>
                  </div>
                )}
              </Card.Body>
            </Card>
          </Col>
        </Row>

        {/* Request Overtime Modal */}
        <Modal show={showModal} onHide={() => setShowModal(false)} size="md" centered>
          <Modal.Header closeButton>
            <Modal.Title>Request Overtime</Modal.Title>
          </Modal.Header>
          <Modal.Body>
            {error && <Alert variant="danger">{error}</Alert>}
            {success && <Alert variant="success">{success}</Alert>}

            <Form onSubmit={handleSubmitRequest}>
              <Form.Group className="mb-3">
                <Form.Label className="fw-bold">Overtime Date *</Form.Label>
                <Form.Control
                  type="date"
                  name="overtime_date"
                  value={formData.overtime_date}
                  onChange={handleFormChange}
                  max={todayStr}
                  required
                />
              </Form.Group>

              <Row>
                <Col md={6}>
                  <Form.Group className="mb-3">
                    <Form.Label className="fw-bold">Start Time (hrs) *</Form.Label>
                    <Form.Select
                      name="start_time"
                      value={formData.start_time}
                      onChange={handleFormChange}
                      required
                    >
                      <option value="">Select hour</option>
                      {HOUR_OPTIONS.map((opt) => (
                        <option key={opt.value} value={opt.value}>
                          {opt.label}
                        </option>
                      ))}
                    </Form.Select>
                  </Form.Group>
                </Col>
                <Col md={6}>
                  <Form.Group className="mb-3">
                    <Form.Label className="fw-bold">End Time (hrs) *</Form.Label>
                    <Form.Select
                      name="end_time"
                      value={formData.end_time}
                      onChange={handleFormChange}
                      required
                    >
                      <option value="">Select hour</option>
                      {HOUR_OPTIONS.map((opt) => (
                        <option key={opt.value} value={opt.value}>
                          {opt.label}
                        </option>
                      ))}
                    </Form.Select>
                  </Form.Group>
                </Col>
              </Row>

              {formData.start_time && formData.end_time && (
                <Alert
                  variant={calculatedHours > 0 ? "info" : "warning"}
                  className="mb-3"
                >
                  <strong>Total Hours:</strong>{" "}
                  {calculatedHours > 0
                    ? `${calculatedHours} hrs`
                    : "End time must be later than start time"}
                </Alert>
              )}

              <Form.Group className="mb-3">
                <Form.Label className="fw-bold">Reason (Optional)</Form.Label>
                <Form.Control
                  as="textarea"
                  rows={3}
                  name="reason"
                  value={formData.reason}
                  onChange={handleFormChange}
                  placeholder="Enter reason for your overtime request..."
                  maxLength={500}
                />
                <small className="text-muted">
                  {formData.reason.length}/500 characters
                </small>
              </Form.Group>
            </Form>
          </Modal.Body>
          <Modal.Footer size="sm">
            <Button
              size="sm"
              variant="secondary"
              onClick={() => setShowModal(false)}
              disabled={submitting}
            >
              Cancel
            </Button>
            <Button
              size="sm"
              variant="primary"
              onClick={handleSubmitRequest}
              disabled={submitting}
            >
              {submitting ? (
                <>
                  <span
                    className="spinner-border spinner-border-sm me-2"
                    role="status"
                    aria-hidden="true"
                  ></span>
                  Submitting...
                </>
              ) : (
                "Submit Request"
              )}
            </Button>
          </Modal.Footer>
        </Modal>

        {/* Cancel Confirmation Modal */}
        <Modal
          show={showCancelModal}
          onHide={() => setShowCancelModal(false)}
          size="sm"
          centered
        >
          <Modal.Header closeButton>
            <Modal.Title>Cancel Request</Modal.Title>
          </Modal.Header>
          <Modal.Body>
            {selectedRequest && (
              <p className="mb-0">
                Cancel your overtime request on{" "}
                <strong>{formatDate(selectedRequest.overtime_date)}</strong>{" "}
                ({formatTime(selectedRequest.start_time)} -{" "}
                {formatTime(selectedRequest.end_time)})? This action cannot be
                undone.
              </p>
            )}
          </Modal.Body>
          <Modal.Footer>
            <Button
              size="sm"
              variant="secondary"
              onClick={() => setShowCancelModal(false)}
              disabled={cancellingId !== null}
            >
              Keep Request
            </Button>
            <Button
              size="sm"
              variant="danger"
              onClick={handleCancelRequest}
              disabled={cancellingId !== null}
            >
              {cancellingId !== null ? (
                <>
                  <span
                    className="spinner-border spinner-border-sm me-2"
                    role="status"
                    aria-hidden="true"
                  ></span>
                  Cancelling...
                </>
              ) : (
                "Yes, Cancel It"
              )}
            </Button>
          </Modal.Footer>
        </Modal>
      </Container>
    </AdminLayout>
  );
};

export default OvertimePage;
